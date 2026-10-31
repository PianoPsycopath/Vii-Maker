import * as THREE from 'three';
import { createComposer, loadNoseTextures } from './composer.js';
import { playVillagerIdle, playRandom, playToggle } from './sound.js';
import { VillagerActor } from './VillagerActor.js';
import { PLAZA_CONFIG, PlazaMath } from './PlazaConfig.js';
import { PlazaEnvironment } from './PlazaEnvironment.js';
import { PlazaTransition, PlazaReturn } from './PlazaTransition.js';

export { PLAZA_CONFIG, PlazaMath };

export class PlazaScene {
  constructor(config) {
    this.canvas = config.canvas;
    this.labelsContainer = config.labelsEl;
    this.hintContainer = config.hintEl;
    this.stageElement = config.stageEl;

    this.geometryData = config.GEO;
    this.manifest = config.M;
    this.lookups = config.lookups;
    this.availableNames = config.names;
    this.baseLookup = config.lookup;
    this.lookOverrides = new Map();
    this.lookup = (name) => {
      const record = this.baseLookup(name);
      const patch = this.lookOverrides.get(name);
      return record && patch ? { ...record, ...patch } : record;
    };
    this.pendingReroll = [];

    this.targetCount = config.count || 10;
    this.isParadeActive = !!config.parade;

    this.interactive = config.interactive !== false;
    this.featuredName = config.featured || null;

    this.onPick = config.onPick;
    this.onReveal = config.onReveal;
    this.onHandoff = config.onHandoff;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
    this.homeFov = this.camera.fov;
    this.restore = config.restore || null;
    this.returnTransition = null;

    this.HOME_POS = new THREE.Vector3(0, 5.6, -12.5);
    this.HOME_TARGET = new THREE.Vector3(0, 0.9, 0);
    this.camera.position.copy(this.HOME_POS);
    this.camera.lookAt(this.HOME_TARGET);

    this.actors = [];
    this.hitBoxes = [];
    this.pendingNames = new Set();

    this.hoverActor = null;
    this.selectedActor = null;
    this.transition = null;
    this.isDisposed = false;

    this.viewportWidth = innerWidth;
    this.viewportHeight = innerHeight;

    this.raycaster = new THREE.Raycaster();
    this.mouseNdc = new THREE.Vector2();

    this.dice = null;
    this.gustMissing = false;
    this.gusts = [];
    this.gustState = null;
    this.gustReady = this.loadGust();

    this.lastSpawnTime = 0;
    this.laneSequence = Math.random();
    this.lastRenderTime = performance.now();

    this.composer = createComposer({ M: this.manifest, lookups: this.lookups });
    this.noseTexturesReady = loadNoseTextures(this.composer);

    this.environment = new PlazaEnvironment(this.scene);
    this.shadowTexture = this.environment.shadowTexture;

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.renderLoop = this.renderLoop.bind(this);
  }

  async initialize() {
    addEventListener('resize', this.handleResize);
    this.handleResize();

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
    sunLight.position.set(-3, 5, -4);
    this.scene.add(sunLight);

    const entries = this.restore ? this.buildRestoreEntries() : this.buildFreshEntries();
    const builtActors = await Promise.all(
      entries.map((entry) => this.createActor(entry.name, entry.x, entry.z, entry.yaw, entry.options))
    );
    builtActors.forEach((actor) => this.registerActor(actor));

    const heroIndex = entries.findIndex((entry) => entry.hero);
    const hero = heroIndex >= 0 ? builtActors[heroIndex] : null;
    if (hero) {
      hero.pinned = true;
      hero.isFrozen = true;
    }

    if (this.isParadeActive) {
      this.actors.forEach((actor) => {
        if (!actor.pinned) this.assignParade(actor);
      });
    }

    if (hero) {
      if (this.restore.stageRect && this.restore.stageRect.height > 0) this.startReturn(hero);
      else hero.isFrozen = false;
    }

    if (this.interactive) {
      this.canvas.addEventListener('pointermove', this.handlePointerMove);
      this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
      this.canvas.addEventListener('click', this.handleClick);
    }

    this.renderer.setAnimationLoop(this.renderLoop);
    return this;
  }

  async loadGust() {
    try {
      const base = import.meta.env.BASE_URL;
      let texture = null;
      for (const path of ['img/gust.png', 'img/icons/gust.png', 'img/fx/gust.png', 'data/gust.png', 'gust.png']) {
        try { texture = await new THREE.TextureLoader().loadAsync(`${base}${path}`); break; } catch {}
      }
      if (!texture) throw new Error('not found in img/, img/icons/ or the site root');
      const { width, height } = texture.image;
      const frames = PLAZA_CONFIG.GUST_FRAMES || Math.max(1, Math.round(width / height));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      return { texture, frames };
    } catch (error) {
      console.error('gust.png could not be loaded; randomizing without the gust', error);
      this.gustMissing = true;
      return null;
    }
  }

  playGust({ onPeak } = {}) {
    return this.gustReady.then((gust) => new Promise((resolve) => {
      const targets = this.actors
        .filter((actor) => !actor.isGone && !actor.isDying)
        .map((actor) => ({
          locate: () => {
            const live = this.actors.find((other) => other.name === actor.name && !other.isGone) || actor;
            return { x: live.x, y: 1.05 * live.scaleFactor, z: live.z, size: PLAZA_CONFIG.GUST_SIZE * live.scaleFactor };
          }
        }));
      if (this.dice) {
        const { mesh } = this.dice;
        targets.push({
          locate: () => ({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, size: PLAZA_CONFIG.GUST_SIZE * 0.7 })
        });
      }
      if (!gust || !targets.length) {
        this.disposeDice();
        if (onPeak) onPeak();
        resolve();
        return;
      }

      const { GUST_FPS, GUST_STAGGER, GUST_PEAK } = PLAZA_CONFIG;
      const frameTime = 1000 / GUST_FPS;
      const now = performance.now();

      this.gusts = targets.map((target) => {
        const material = new THREE.SpriteMaterial({
          map: gust.texture.clone(),
          transparent: true,
          depthTest: false,
          depthWrite: false
        });
        material.map.repeat.set(1 / gust.frames, 1);
        const sprite = new THREE.Sprite(material);
        sprite.renderOrder = 20;
        sprite.visible = false;
        this.scene.add(sprite);
        return { target, sprite, material, start: now + PlazaMath.getRandomFloat(0, GUST_STAGGER) * 1000 };
      });

      this.gustState = {
        frames: gust.frames,
        frameTime,
        peakAt: Math.floor(gust.frames * GUST_PEAK) * frameTime,
        onPeak: () => {
          this.disposeDice();
          if (onPeak) onPeak();
        },
        resolve,
        peaked: false
      };
    }));
  }

  updateGusts(now) {
    const state = this.gustState;
    if (!state) return;

    if (!state.peaked && this.gusts.every((gust) => now - gust.start >= state.peakAt)) {
      state.peaked = true;
      try { if (state.onPeak) state.onPeak(); } catch (error) { console.error('Gust peak callback failed', error); }
    }

    let running = 0;
    for (const gust of this.gusts) {
      const frame = Math.floor((now - gust.start) / state.frameTime);
      if (frame >= state.frames) {
        gust.sprite.visible = false;
        continue;
      }
      running++;
      if (frame < 0) continue;

      const { target, sprite, material } = gust;
      const where = target.locate();
      material.map.offset.x = frame / state.frames;
      sprite.position.set(where.x, where.y, where.z);
      sprite.scale.setScalar(where.size);
      sprite.visible = true;
    }

    if (running === 0) {
      for (const gust of this.gusts) {
        this.scene.remove(gust.sprite);
        gust.material.map.dispose();
        gust.material.dispose();
      }
      this.gusts = [];
      this.gustState = null;
      state.resolve();
    }
  }

  buildDiceFaceTexture(pips) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#2f4644';
    ctx.lineWidth = 12;
    ctx.lineJoin = 'round';
    ctx.strokeRect(6, 6, size - 12, size - 12);
    ctx.fillStyle = '#2f4644';
    const layouts = {
      1: [[.5, .5]],
      2: [[.27, .27], [.73, .73]],
      3: [[.27, .27], [.5, .5], [.73, .73]],
      4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
      5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
      6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]]
    };
    for (const [x, y] of layouts[pips]) {
      ctx.beginPath();
      ctx.arc(x * size, y * size, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }


  dropDice(from = null) {
    this.disposeDice();

    const SIZE = 1.25;
    const textures = [2, 5, 1, 6, 4, 3].map((pips) => this.buildDiceFaceTexture(pips));
    const materials = textures.map((map) => new THREE.MeshBasicMaterial({ map }));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(SIZE, SIZE, SIZE), materials);
    mesh.position.set(0.3, 9.5, -1.2);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const launchVelocity = new THREE.Vector3(-0.5, 0, -1.6);
    let landing = null;
    let launchUp = null;

    if (from) {
      this.camera.updateMatrixWorld();
      const ndc = new THREE.Vector2((from.x / this.viewportWidth) * 2 - 1, -(from.y / this.viewportHeight) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const hexWidthPx = from.width * 0.75;
      const distance = (Math.SQRT2 * SIZE * this.viewportHeight) /
        (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * hexWidthPx);
      mesh.position.copy(this.camera.position).addScaledVector(ray.ray.direction, distance);
      mesh.quaternion.setFromEuler(new THREE.Euler(-0.256, Math.PI / 4, 0, 'XYZ'));

      landing = new THREE.Vector3(
        PlazaMath.getRandomFloat(-1.4, 1.4), SIZE / 2, PlazaMath.getRandomFloat(-2.4, 0.6)
      );
      launchUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    }
    mesh.renderOrder = 5;
    this.scene.add(mesh);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, opacity: 0 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    shadow.renderOrder = -1;
    this.scene.add(shadow);

    return new Promise((resolve) => {
      this.dice = {
        mesh, shadow, textures, materials, resolve,
        half: SIZE / 2,
        radius: SIZE * 0.58,
        velocity: launchVelocity,
        spin: new THREE.Vector3(9, 6, 8),
        bounces: 0,
        phase: from ? 'launch' : 'air', 
        landing,
        launchUp,
        launchSpeed: 26,
        hiddenSince: 0,
        slowSince: 0,
        settleStart: 0,
        settleFrom: new THREE.Quaternion(),
        settleTo: new THREE.Quaternion(),
        restSince: 0,
        firstGround: 0,
        lastHit: 0,
        previous: new Map()
      };
      playRandom();
    });
  }

  beginDiceSettle(now) {
    const dice = this.dice;
    const { mesh } = dice;
    dice.phase = 'settle';
    dice.settleStart = now;
    dice.settleFrom.copy(mesh.quaternion);
    dice.velocity.set(0, 0, 0);

    let best = null;
    let bestY = -2;
    for (const axis of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const world = new THREE.Vector3(...axis).applyQuaternion(mesh.quaternion);
      if (world.y > bestY) { bestY = world.y; best = world; }
    }
    const correction = new THREE.Quaternion().setFromUnitVectors(best, new THREE.Vector3(0, 1, 0));
    dice.settleTo.copy(correction.multiply(mesh.quaternion));
  }

  collideDice(deltaTime, now) {
    const dice = this.dice;
    const { mesh, velocity, spin, half } = dice;
    const bottom = mesh.position.y - half;

    for (const actor of this.actors) {
      if (actor.isGone || actor.isDying) continue;

      const before = dice.previous.get(actor);
      const actorVx = before && deltaTime > 0 ? (actor.x - before.x) / deltaTime : 0;
      const actorVz = before && deltaTime > 0 ? (actor.z - before.z) / deltaTime : 0;
      dice.previous.set(actor, { x: actor.x, z: actor.z });

      if (bottom >= 1.9 * actor.scaleFactor) continue;

      const reach = dice.radius + 0.38 * actor.scaleFactor;
      let dx = mesh.position.x - actor.x;
      let dz = mesh.position.z - actor.z;
      let distance = Math.hypot(dx, dz);
      if (distance >= reach) continue;
      if (distance < 1e-4) {
        const angle = Math.random() * Math.PI * 2;
        dx = Math.cos(angle);
        dz = Math.sin(angle);
        distance = 1;
      }
      const nx = dx / distance;
      const nz = dz / distance;

      mesh.position.x += nx * (reach - distance) * 0.3;
      mesh.position.z += nz * (reach - distance) * 0.3;

      const approach = (velocity.x - actorVx) * nx + (velocity.z - actorVz) * nz;
      if (approach < 0) {
        velocity.x -= 1.1 * approach * nx;
        velocity.z -= 1.1 * approach * nz;
      }
      const actorSpeed = Math.hypot(actorVx, actorVz);
      const wanted = Math.min(0.9, actorSpeed > 0.15 ? actorSpeed * 0.6 : 0.3);
      const along = velocity.x * nx + velocity.z * nz;
      if (along < wanted) {
        velocity.x += nx * (wanted - along);
        velocity.z += nz * (wanted - along);
      }

      if ((dice.phase === 'settle' || dice.phase === 'rest') && actorSpeed > 0.15) {
        dice.phase = 'ground';
        dice.slowSince = 0;
      } else if (dice.phase === 'air') {
        spin.add(new THREE.Vector3(
          PlazaMath.getRandomFloat(-4, 4), PlazaMath.getRandomFloat(-4, 4), PlazaMath.getRandomFloat(-4, 4)
        ));
      }
      if (now - dice.lastHit > 250) {
        dice.lastHit = now;
        playToggle();
      }
    }
  }

  updateDice(deltaTime, now) {
    const dice = this.dice;
    if (!dice) return;
    const { mesh, shadow, velocity, spin, half } = dice;
    const GRAVITY = 24;
    const REACH = 5.6;

    if (dice.phase === 'launch') {
      dice.launchSpeed += 70 * deltaTime;
      mesh.position.addScaledVector(dice.launchUp, dice.launchSpeed * deltaTime);
      mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(spin.clone().normalize(), spin.length() * deltaTime));
      shadow.material.opacity = 0;

      if (!dice.hiddenSince && mesh.position.clone().project(this.camera).y > 1.35) dice.hiddenSince = now;
      if (dice.hiddenSince && now - dice.hiddenSince > 350) {
        const { landing } = dice;
        mesh.position.set(landing.x, 11, landing.z);
        velocity.set(PlazaMath.getRandomFloat(-0.5, 0.5), -5, PlazaMath.getRandomFloat(-0.5, 0.5));
        dice.phase = 'air';
        playRandom();
      }
      return;
    }

    if (dice.phase === 'air') {
      velocity.y -= GRAVITY * deltaTime;
      mesh.position.addScaledVector(velocity, deltaTime);

      const turn = spin.length() * deltaTime;
      if (turn > 0) {
        mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(spin.clone().normalize(), turn));
      }

      if (mesh.position.y <= half && velocity.y < 0) {
        mesh.position.y = half;
        const impact = -velocity.y;
        dice.bounces++;
        playToggle();

        if (impact < 3.2 || dice.bounces >= 5) {
          dice.phase = 'ground';
          dice.firstGround = now;
          velocity.y = 0;
          spin.set(0, 0, 0);
        } else {
          velocity.y = impact * 0.5;
          velocity.x *= 0.75;
          velocity.z *= 0.75;
          spin.multiplyScalar(0.8).add(new THREE.Vector3(
            PlazaMath.getRandomFloat(-5, 5), PlazaMath.getRandomFloat(-5, 5), PlazaMath.getRandomFloat(-5, 5)
          ));
        }
      }
    } else {
      mesh.position.y = half;

      if (dice.phase === 'ground') {
        const damping = Math.exp(-6 * deltaTime);
        velocity.x *= damping;
        velocity.z *= damping;
        mesh.position.x += velocity.x * deltaTime;
        mesh.position.z += velocity.z * deltaTime;

        const speed = Math.hypot(velocity.x, velocity.z);
        if (speed > 0.01) {
          const axis = new THREE.Vector3(velocity.z, 0, -velocity.x).normalize();
          mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, (speed * deltaTime) / (half * 1.1)));
        }

        if (speed < 0.3) {
          if (!dice.slowSince) dice.slowSince = now;
          if (now - dice.slowSince > 120) this.beginDiceSettle(now);
        } else {
          dice.slowSince = 0;
        }
      } else if (dice.phase === 'settle') {
        const progress = PlazaMath.clamp01((now - dice.settleStart) / 350);
        mesh.quaternion.slerpQuaternions(dice.settleFrom, dice.settleTo, PlazaMath.easeCubicInOut(progress));
        if (progress >= 1) {
          dice.phase = 'rest';
          dice.restSince = now;
        }
      }
    }

    this.collideDice(deltaTime, now);

    const radial = Math.hypot(mesh.position.x, mesh.position.z);
    if (radial > REACH) {
      mesh.position.x *= REACH / radial;
      mesh.position.z *= REACH / radial;
      velocity.x *= -0.4;
      velocity.z *= -0.4;
    }

    if (dice.phase === 'ground' && dice.firstGround && now - dice.firstGround > 1400) this.beginDiceSettle(now);
    const restedLongEnough = dice.phase === 'rest' && now - dice.restSince > 350;
    const onFloorTooLong = dice.firstGround && now - dice.firstGround > 1900 && dice.phase !== 'air';
    if (dice.resolve && (restedLongEnough || onFloorTooLong)) {
      const resolve = dice.resolve;
      dice.resolve = null;
      resolve();
    }

    const height = Math.max(0, mesh.position.y - half);
    shadow.position.x = mesh.position.x;
    shadow.position.z = mesh.position.z;
    shadow.scale.setScalar((1.4 + height * 0.25) * 1.25);
    shadow.material.opacity = Math.max(0, 1 - height / 7);
  }

  disposeDice() {
    const dice = this.dice;
    if (!dice) return;
    this.dice = null;
    this.scene.remove(dice.mesh, dice.shadow);
    dice.mesh.geometry.dispose();
    dice.materials.forEach((material) => material.dispose());
    dice.textures.forEach((texture) => texture.dispose());
    dice.shadow.geometry.dispose();
    dice.shadow.material.dispose();
    if (dice.resolve) dice.resolve();
  }

  calculateSpawnSpot(takenSpots) {
    for (let i = 0; i < 40; i++) {
      const angle = PlazaMath.getRandomFloat(0, Math.PI * 2);
      const radius = Math.sqrt(Math.random()) * PLAZA_CONFIG.RADIUS;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (takenSpots.every((spot) => Math.hypot(spot[0] - x, spot[1] - z) > 1.3)) {
        return [x, z];
      }
    }
    return [
      PlazaMath.getRandomFloat(-PLAZA_CONFIG.RADIUS, PLAZA_CONFIG.RADIUS) * 0.7,
      PlazaMath.getRandomFloat(-PLAZA_CONFIG.RADIUS, PLAZA_CONFIG.RADIUS) * 0.7
    ];
  }

  getRoster() {
    return this.actors
      .filter((actor) => !actor.isGone && !actor.isDying && !actor.isFading)
      .map((actor) => ({
        name: actor.name,
        x: actor.x,
        z: actor.z,
        yaw: actor.yaw,
        previewConfig: { ...actor.previewConfig }
      }));
  }

  buildFreshEntries() {
    const pool = this.availableNames.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = PlazaMath.getRandomInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (this.featuredName) {
      const at = pool.indexOf(this.featuredName);
      if (at > 0) {
        pool.splice(at, 1);
        pool.unshift(this.featuredName);
      }
    }
    const chosenNames = pool.slice(0, Math.min(this.targetCount, pool.length));

    const takenSpots = [];
    return chosenNames.map((name) => {
      const spot = this.calculateSpawnSpot(takenSpots);
      takenSpots.push(spot);
      return { name, x: spot[0], z: spot[1] };
    });
  }

  buildRestoreEntries() {
    const { roster = [], featured = null } = this.restore;
    const MIN_FROM_CENTER = 1.8;
    const entries = [];
    const seen = new Set(featured ? [featured.name] : []);

    for (const item of roster) {
      if (seen.has(item.name) || !this.baseLookup(item.name)) continue;
      seen.add(item.name);
      let { x, z } = item;
      if (featured && Math.hypot(x, z) < MIN_FROM_CENTER) {
        const angle = Math.hypot(x, z) > 0.01 ? Math.atan2(z, x) : PlazaMath.getRandomFloat(0, Math.PI * 2);
        x = Math.cos(angle) * MIN_FROM_CENTER;
        z = Math.sin(angle) * MIN_FROM_CENTER;
      }
      entries.push({ name: item.name, x, z, yaw: item.yaw, options: { previewConfig: item.previewConfig } });
    }

    if (featured) {
      entries.push({
        name: featured.name,
        x: 0,
        z: 0,
        yaw: 0,
        hero: true,
        options: { previewConfig: featured.previewConfig, simShift: featured.simShift }
      });
    }
    return entries;
  }

  startReturn(hero) {
    this.returnTransition = new PlazaReturn({
      camera: this.camera,
      hero,
      actors: this.actors.slice(),
      environment: this.environment,
      stageRect: this.restore.stageRect,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      homePos: this.HOME_POS,
      homeTarget: this.HOME_TARGET,
      homeFov: this.homeFov,
      onComplete: () => {
        hero.isFrozen = false;
        hero.state = 'idle';
        hero.timer = PlazaMath.getRandomFloat(1.2, 2.5);
      }
    });
  }

  async createActor(name, x, z, yaw = PlazaMath.getRandomFloat(-Math.PI, Math.PI), options = {}) {
    const actor = new VillagerActor(name, x, z, yaw, this, options);
    return await actor.build();
  }

  registerActor(actor) {
    actor.root.position.set(actor.x, 0, actor.z);
    actor.root.rotation.y = actor.yaw;
    this.scene.add(actor.root);
    this.labelsContainer.appendChild(actor.tagElement);
    this.actors.push(actor);
    this.hitBoxes.push(actor.hitBox);
  }

  async refreshActor(name) {
    const old = this.actors.find((actor) => actor.name === name && !actor.isGone);
    if (!old || this.isDisposed) return;
    const fresh = await this.createActor(name, old.x, old.z, old.yaw);
    if (this.isDisposed) {
      fresh.dispose();
      return;
    }
    this.retireActor(old);
    this.registerActor(fresh);
  }

  async prepareReroll(patchFor, skipName = null) {
    const targets = this.actors.filter((actor) => !actor.isGone && !actor.isDying && actor.name !== skipName);
    for (const actor of targets) {
      const record = this.baseLookup(actor.name);
      if (record) this.lookOverrides.set(actor.name, patchFor(actor.name, record));
    }
    const pairs = await Promise.all(targets.map(async (old) => ({
      old,
      fresh: await this.createActor(old.name, old.x, old.z, old.yaw)
    })));
    if (this.isDisposed) {
      pairs.forEach(({ fresh }) => fresh.dispose());
      return;
    }
    this.pendingReroll = pairs;
  }

  applyReroll() {
    const pairs = this.pendingReroll;
    this.pendingReroll = [];
    for (const { old, fresh } of pairs) {
      if (old.isGone || this.isDisposed) {
        fresh.dispose();
        continue;
      }
      fresh.x = old.x;
      fresh.z = old.z;
      fresh.yaw = old.yaw;
      this.retireActor(old);
      this.registerActor(fresh);
    }
  }

  retireActor(actor) {
    actor.isGone = true;
    if (this.hoverActor === actor) this.hoverActor = null;
    this.scene.remove(actor.root);
    actor.tagElement.remove();
    actor.dispose();
    this.actors.splice(this.actors.indexOf(actor), 1);
    this.hitBoxes.splice(this.hitBoxes.indexOf(actor.hitBox), 1);
  }

  setParade(isActive) {
    if (this.selectedActor || this.isParadeActive === !!isActive) return;
    this.isParadeActive = !!isActive;

    for (const actor of this.actors) {
      if (actor.isGone || actor.pinned) continue;
      this.isParadeActive ? this.assignParade(actor) : this.releaseParade(actor);
    }

    if (!isActive) {
      this.actors
        .filter((actor) => !actor.pinned)
        .sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))
        .slice(0, Math.max(0, this.actors.length - this.targetCount))
        .forEach((actor) => {
          actor.isDying = true;
          actor.isFading = false;
          actor.material.transparent = true;
        });
    }
  }

  assignParade(actor) {
    actor.isParade = true;
    actor.isFree = true;
    actor.state = 'walk';
    actor.speedMultiplier = PLAZA_CONFIG.PARADE_SPEED * PlazaMath.getRandomFloat(0.98, 1.04);

    const lane = Math.max(-PLAZA_CONFIG.LANE_X, Math.min(PLAZA_CONFIG.LANE_X, actor.x));
    actor.targetX = lane;
    actor.targetZ = actor.z + PLAZA_CONFIG.PARADE_DZ * 60;
  }

  releaseParade(actor) {
    actor.isParade = false;
    actor.speedMultiplier = PlazaMath.getRandomFloat(0.9, 1.25);
    actor.assignRandomTarget();
  }

  async spawnParadeActor() {
    const liveNames = new Set([...this.actors.map((actor) => actor.name), ...this.pendingNames]);
    const freeNames = this.availableNames.filter((name) => !liveNames.has(name));
    const assignedName = freeNames.length ? freeNames[PlazaMath.getRandomInt(freeNames.length)] : null;

    if (!assignedName) return;
    this.pendingNames.add(assignedName);

    try {
      this.laneSequence = (this.laneSequence + 0.618034) % 1;
      let laneX = (this.laneSequence * 2 - 1) * PLAZA_CONFIG.LANE_X;

      for (
        let i = 0;
        i < 5 &&
        !this.actors.every((actor) => Math.hypot(actor.x - laneX, (actor.z - PLAZA_CONFIG.SPAWN_Z) * 0.35) > 1.6);
        i++
      ) {
        this.laneSequence = (this.laneSequence + 0.618034) % 1;
        laneX = (this.laneSequence * 2 - 1) * PLAZA_CONFIG.LANE_X;
      }

      const actor = await this.createActor(
        assignedName,
        laneX,
        PLAZA_CONFIG.SPAWN_Z,
        Math.atan2(0, -PLAZA_CONFIG.PARADE_DZ)
      );
      actor.isFading = true;
      actor.material.transparent = true;
      actor.material.opacity = 0;
      actor.shadowMesh.material.opacity = 0;

      if (this.isDisposed || this.selectedActor || !this.isParadeActive) {
        actor.dispose();
        return;
      }

      this.registerActor(actor);
      this.assignParade(actor);
    } finally {
      this.pendingNames.delete(assignedName);
    }
  }

  handleActorSelect(actor) {
    if (this.selectedActor || this.returnTransition || !actor || actor.isDying) return;
    this.selectedActor = actor;
    actor.isFrozen = true;

    if (actor.isFading) {
      actor.isFading = false;
      actor.material.opacity = 1;
      actor.material.transparent = false;
      actor.material.needsUpdate = true;
      actor.shadowMesh.material.opacity = 1;
    }

    this.setHoverActor(null);
    this.canvas.style.cursor = 'default';
    actor.tagElement.classList.remove('hover');

    this.transition = new PlazaTransition({
      camera: this.camera,
      selectedActor: actor,
      stageElement: this.stageElement,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      homeTarget: this.HOME_TARGET,
      onReveal: this.onReveal,
      onHandoff: () => {
        if (this.onHandoff) this.onHandoff();
        this.canvas.style.opacity = '0';
        setTimeout(() => this.dispose(), 500);
      },
      environment: this.environment
    });

    for (const otherActor of this.actors) {
      if (otherActor === actor) continue;
      otherActor.material.transparent = true;
      otherActor.material.needsUpdate = true;
      otherActor.isFrozen = false;
    }

    if (this.onPick) this.onPick(actor.name, actor.previewConfig, this.getRoster());
  }

  setHoverActor(actor) {
    if (this.selectedActor || this.hoverActor === actor) return;
    if (this.hoverActor) this.hoverActor.tagElement.classList.remove('hover');
    this.hoverActor = actor;
    if (actor) actor.tagElement.classList.add('hover');
    this.canvas.style.cursor = actor ? 'pointer' : 'default';
  }

  processRaycastHit(event) {
    this.mouseNdc.set((event.clientX / this.viewportWidth) * 2 - 1, -(event.clientY / this.viewportHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    const hitTarget = this.raycaster.intersectObjects(
      this.hitBoxes.filter((mesh) => !mesh.userData.actor.isGone),
      false
    )[0];
    return hitTarget ? hitTarget.object.userData.actor : null;
  }

  handlePointerMove(event) {
    if (!this.selectedActor && !this.returnTransition) this.setHoverActor(this.processRaycastHit(event));
  }

  handlePointerLeave() {
    this.setHoverActor(null);
  }

  handleClick(event) {
    if (!this.selectedActor && !this.returnTransition) this.handleActorSelect(this.processRaycastHit(event));
  }

  handleResize() {
    this.viewportWidth = innerWidth;
    this.viewportHeight = innerHeight;
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);
    this.camera.aspect = this.viewportWidth / this.viewportHeight;
    this.camera.updateProjectionMatrix();
  }

  renderLoop(currentTime) {
    if (this.isDisposed) return;
    const deltaTime = Math.min(0.05, (currentTime - this.lastRenderTime) / 1000);
    this.lastRenderTime = currentTime;

    for (const actor of this.actors) {
      if (actor.isGone) continue;
      const distanceMoved =
        actor.isFrozen || actor === this.selectedActor ? 0 : actor.calculateBehavior(deltaTime, this.actors);
      if (actor !== this.selectedActor || !this.transition) actor.updatePose(deltaTime, distanceMoved);
    }

    if (this.interactive && !this.selectedActor && !this.transition) {
      const timeSeconds = currentTime / 1000;
      const idleIntervals = this.isParadeActive ? PLAZA_CONFIG.IDLE_EVERY_PARADE : PLAZA_CONFIG.IDLE_EVERY;

      for (const actor of this.actors) {
        if (actor.isGone || actor.isDying || actor.isFading || actor.isFrozen || timeSeconds < actor.nextIdleTime) continue;
        actor.nextIdleTime = timeSeconds + PlazaMath.getRandomFloat(idleIntervals[0], idleIntervals[1]);

        const projectionVector = actor.root.position.clone();
        projectionVector.y += 1;
        projectionVector.project(this.camera);

        if (Math.abs(projectionVector.x) <= 1 && projectionVector.z <= 1) {
          playVillagerIdle({ pan: projectionVector.x * 0.8 });
        }
      }
    }

    if (this.isParadeActive && !this.selectedActor) {
      const isOffscreen = (actor) => {
        if (actor.z > 0) return false;
        const projectionVector = new THREE.Vector3(actor.x, 2.5 * actor.scaleFactor, actor.z).project(this.camera);
        return projectionVector.y < -1.2 || Math.abs(projectionVector.x) > 1.3;
      };

      this.actors.filter((actor) => actor.isParade && isOffscreen(actor)).forEach((actor) => this.retireActor(actor));
      const spawnInterval = PLAZA_CONFIG.PARADE_INTERVAL * 1000;

      if (
        !this.returnTransition &&
        this.actors.length + this.pendingNames.size < PLAZA_CONFIG.PARADE_MAX &&
        currentTime - this.lastSpawnTime >= spawnInterval
      ) {
        this.lastSpawnTime = Math.max(this.lastSpawnTime + spawnInterval, currentTime - spawnInterval);
        this.spawnParadeActor();
      }
    }

    for (const actor of this.actors.filter((target) => target.isDying && !target.isGone)) {
      const opacityLevel = Math.max(0, actor.material.opacity - deltaTime * 2.5);
      actor.material.opacity = opacityLevel;
      actor.shadowMesh.material.opacity = opacityLevel;
      actor.tagElement.style.opacity = opacityLevel;
      if (opacityLevel <= 0) this.retireActor(actor);
    }

    for (const actor of this.actors) {
      if (!actor.isFading || actor.isGone || actor === this.selectedActor) continue;
      const opacityLevel = PlazaMath.clamp01((PLAZA_CONFIG.SPAWN_Z - actor.z) / 6);
      actor.material.opacity = opacityLevel;
      actor.shadowMesh.material.opacity = opacityLevel;
      if (opacityLevel >= 1) {
        actor.isFading = false;
        actor.material.transparent = false;
        actor.material.needsUpdate = true;
      }
    }

    if (this.returnTransition) {
      this.returnTransition.update(currentTime);
      if (this.returnTransition.isComplete) this.returnTransition = null;
    }

    this.environment.update(deltaTime, this.isParadeActive);

    if (this.transition) {
      this.transition.update(currentTime, this.actors, this.scene);
      this.selectedActor.updatePose(deltaTime, 0);
    }

    this.updateDice(deltaTime, currentTime);
    this.updateGusts(currentTime);

    this.camera.updateMatrixWorld();

    for (const actor of this.actors) {
      if (actor.isGone) continue;
      const projectionVector = new THREE.Vector3(actor.x, 2.35 * actor.scaleFactor, actor.z).project(this.camera);
      actor.tagElement.style.transform = `translate(${(projectionVector.x * 0.5 + 0.5) * this.viewportWidth}px, ${(
        -projectionVector.y * 0.5 +
        0.5
      ) * this.viewportHeight}px) translate(-50%, -100%)`;

      actor.noseMaterial.opacity = actor.material.opacity;
      if (actor.noseMaterial.transparent !== actor.material.transparent) {
        actor.noseMaterial.transparent = actor.material.transparent;
        actor.noseMaterial.needsUpdate = true;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.renderer.setAnimationLoop(null);
    removeEventListener('resize', this.handleResize);
    this.disposeDice();

    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (object.material.map) object.material.map.dispose();
        object.material.dispose();
      }
    });

    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.labelsContainer.remove();
    if (this.hintContainer) this.hintContainer.remove();
  }
}