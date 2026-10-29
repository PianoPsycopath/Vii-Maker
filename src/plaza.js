import * as THREE from 'three';
import { createComposer, loadNoseTextures } from './composer.js';
import { playVillagerIdle } from './sound.js';
import { VillagerActor } from './VillagerActor.js';
import { PLAZA_CONFIG, PlazaMath } from './PlazaConfig.js';
import { PlazaEnvironment } from './PlazaEnvironment.js';
import { PlazaTransition } from './PlazaTransition.js';

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
    this.lookup = config.lookup;

    this.targetCount = config.count || 10;
    this.isParadeActive = !!config.parade;

    this.onPick = config.onPick;
    this.onReveal = config.onReveal;
    this.onHandoff = config.onHandoff;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);

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

    const pool = this.availableNames.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = PlazaMath.getRandomInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosenNames = pool.slice(0, Math.min(this.targetCount, pool.length));

    const takenSpots = [];
    const spawnSpots = chosenNames.map(() => {
      const spot = this.calculateSpawnSpot(takenSpots);
      takenSpots.push(spot);
      return spot;
    });

    const actorPromises = chosenNames.map((name, index) =>
      this.createActor(name, spawnSpots[index][0], spawnSpots[index][1])
    );

    const builtActors = await Promise.all(actorPromises);
    builtActors.forEach((actor) => this.registerActor(actor));

    if (this.isParadeActive) {
      this.actors.forEach((actor) => this.assignParade(actor));
    }

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('click', this.handleClick);

    this.renderer.setAnimationLoop(this.renderLoop);
    return this;
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

  async createActor(name, x, z, yaw = PlazaMath.getRandomFloat(-Math.PI, Math.PI)) {
    const actor = new VillagerActor(name, x, z, yaw, this);
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
      if (actor.isGone) continue;
      this.isParadeActive ? this.assignParade(actor) : this.releaseParade(actor);
    }

    if (!isActive) {
      this.actors
        .slice()
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
    if (this.selectedActor || !actor || actor.isDying) return;
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

    if (this.onPick) this.onPick(actor.name, actor.previewConfig);
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
    if (!this.selectedActor) this.setHoverActor(this.processRaycastHit(event));
  }

  handlePointerLeave() {
    this.setHoverActor(null);
  }

  handleClick(event) {
    if (!this.selectedActor) this.handleActorSelect(this.processRaycastHit(event));
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

    if (!this.selectedActor && !this.transition) {
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

    this.environment.update(deltaTime, this.isParadeActive);

    if (this.transition) {
      this.transition.update(currentTime, this.actors, this.scene);
      this.selectedActor.updatePose(deltaTime, 0);
    }

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