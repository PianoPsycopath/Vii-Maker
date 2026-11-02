import * as THREE from 'three';
import { playRandom, playToggle } from '../sound.js';
import { PlazaMath } from './PlazaConfig.js';

const SIZE = 1.25;
const GRAVITY = 24;
const REACH = 5.6;
const FACE_TEXTURE_SIZE = 128;
const FACE_ORDER = [2, 5, 1, 6, 4, 3];
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const LAUNCH_START_SPEED = 26;
const LAUNCH_ACCELERATION = 70;
const OFFSCREEN_NDC_Y = 1.35;
const OFFSCREEN_HOLD_MS = 350;
const DROP_HEIGHT = 11;
const SETTLE_MS = 350;
const REST_MS = 350;
const SLOW_SPEED = 0.3;
const SLOW_HOLD_MS = 120;
const FORCE_SETTLE_MS = 1400;
const GIVE_UP_MS = 1900;
const HIT_SOUND_GAP_MS = 250;
const MAX_BOUNCES = 5;
const MIN_BOUNCE_IMPACT = 3.2;

const PIP_LAYOUTS = {
  1: [[.5, .5]],
  2: [[.27, .27], [.73, .73]],
  3: [[.27, .27], [.5, .5], [.73, .73]],
  4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
  5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
  6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]]
};

function buildFaceTexture(pips) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FACE_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE);
  ctx.strokeStyle = '#2f4644';
  ctx.lineWidth = 12;
  ctx.lineJoin = 'round';
  ctx.strokeRect(6, 6, FACE_TEXTURE_SIZE - 12, FACE_TEXTURE_SIZE - 12);

  ctx.fillStyle = '#2f4644';
  for (const [x, y] of PIP_LAYOUTS[pips]) {
    ctx.beginPath();
    ctx.arc(x * FACE_TEXTURE_SIZE, y * FACE_TEXTURE_SIZE, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function randomVector(range) {
  return new THREE.Vector3(
    PlazaMath.getRandomFloat(-range, range),
    PlazaMath.getRandomFloat(-range, range),
    PlazaMath.getRandomFloat(-range, range)
  );
}

function spinBy(mesh, axis, angle) {
  mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
}

export class DiceRoller {
  constructor({ scene, camera, shadowTexture, getActors, getViewport }) {
    this.scene = scene;
    this.camera = camera;
    this.shadowTexture = shadowTexture;
    this.getActors = getActors;
    this.getViewport = getViewport;
    this.state = null;
  }

  get mesh() {
    return this.state?.mesh ?? null;
  }

  drop(from = null) {
    this.dispose();

    const textures = FACE_ORDER.map((pips) => buildFaceTexture(pips));
    const materials = textures.map((map) => new THREE.MeshBasicMaterial({ map }));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(SIZE, SIZE, SIZE), materials);
    mesh.position.set(0.3, 9.5, -1.2);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    mesh.renderOrder = 5;

    let landing = null;
    let launchUp = null;
    if (from) {
      this.placeOverButton(mesh, from);
      landing = new THREE.Vector3(
        PlazaMath.getRandomFloat(-1.4, 1.4), SIZE / 2, PlazaMath.getRandomFloat(-2.4, 0.6)
      );
      launchUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    }
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
      this.state = {
        mesh, shadow, textures, materials, resolve, landing, launchUp,
        half: SIZE / 2,
        radius: SIZE * 0.58,
        velocity: new THREE.Vector3(-0.5, 0, -1.6),
        spin: new THREE.Vector3(9, 6, 8),
        phase: from ? 'launch' : 'air',
        launchSpeed: LAUNCH_START_SPEED,
        bounces: 0,
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

  placeOverButton(mesh, from) {
    const { width, height } = this.getViewport();
    this.camera.updateMatrixWorld();

    const ndc = new THREE.Vector2((from.x / width) * 2 - 1, -(from.y / height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);

    const hexWidthPx = from.width * 0.75;
    const distance = (Math.SQRT2 * SIZE * height) /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * hexWidthPx);

    mesh.position.copy(this.camera.position).addScaledVector(ray.ray.direction, distance);
    mesh.quaternion.setFromEuler(new THREE.Euler(-0.256, Math.PI / 4, 0, 'XYZ'));
  }

  update(deltaTime, now) {
    const dice = this.state;
    if (!dice) return;

    if (dice.phase === 'launch') {
      this.updateLaunch(dice, deltaTime, now);
      return;
    }

    if (dice.phase === 'air') this.updateAir(dice, deltaTime, now);
    else this.updateGrounded(dice, deltaTime, now);

    this.collide(deltaTime, now);
    this.containInArena(dice);
    this.resolveIfDone(dice, now);
    this.updateShadow(dice);
  }

  updateLaunch(dice, deltaTime, now) {
    const { mesh, shadow, velocity, spin } = dice;

    dice.launchSpeed += LAUNCH_ACCELERATION * deltaTime;
    mesh.position.addScaledVector(dice.launchUp, dice.launchSpeed * deltaTime);
    spinBy(mesh, spin.clone().normalize(), spin.length() * deltaTime);
    shadow.material.opacity = 0;

    if (!dice.hiddenSince && mesh.position.clone().project(this.camera).y > OFFSCREEN_NDC_Y) {
      dice.hiddenSince = now;
    }
    if (dice.hiddenSince && now - dice.hiddenSince > OFFSCREEN_HOLD_MS) {
      const { landing } = dice;
      mesh.position.set(landing.x, DROP_HEIGHT, landing.z);
      velocity.set(PlazaMath.getRandomFloat(-0.5, 0.5), -5, PlazaMath.getRandomFloat(-0.5, 0.5));
      dice.phase = 'air';
      playRandom();
    }
  }

  updateAir(dice, deltaTime, now) {
    const { mesh, velocity, spin, half } = dice;

    velocity.y -= GRAVITY * deltaTime;
    mesh.position.addScaledVector(velocity, deltaTime);

    const turn = spin.length() * deltaTime;
    if (turn > 0) spinBy(mesh, spin.clone().normalize(), turn);

    if (mesh.position.y > half || velocity.y >= 0) return;

    mesh.position.y = half;
    const impact = -velocity.y;
    dice.bounces++;
    playToggle();

    if (impact < MIN_BOUNCE_IMPACT || dice.bounces >= MAX_BOUNCES) {
      dice.phase = 'ground';
      dice.firstGround = now;
      velocity.y = 0;
      spin.set(0, 0, 0);
      return;
    }

    velocity.y = impact * 0.5;
    velocity.x *= 0.75;
    velocity.z *= 0.75;
    spin.multiplyScalar(0.8).add(randomVector(5));
  }

  updateGrounded(dice, deltaTime, now) {
    const { mesh, velocity, half } = dice;
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
        spinBy(mesh, axis, (speed * deltaTime) / (half * 1.1));
      }

      if (speed < SLOW_SPEED) {
        if (!dice.slowSince) dice.slowSince = now;
        if (now - dice.slowSince > SLOW_HOLD_MS) this.beginSettle(dice, now);
      } else {
        dice.slowSince = 0;
      }
    } else if (dice.phase === 'settle') {
      const progress = PlazaMath.clamp01((now - dice.settleStart) / SETTLE_MS);
      mesh.quaternion.slerpQuaternions(dice.settleFrom, dice.settleTo, PlazaMath.easeCubicInOut(progress));
      if (progress >= 1) {
        dice.phase = 'rest';
        dice.restSince = now;
      }
    }
  }

  beginSettle(dice, now) {
    const { mesh } = dice;
    dice.phase = 'settle';
    dice.settleStart = now;
    dice.settleFrom.copy(mesh.quaternion);
    dice.velocity.set(0, 0, 0);

    let best = null;
    let bestY = -2;
    for (const axis of AXES) {
      const world = new THREE.Vector3(...axis).applyQuaternion(mesh.quaternion);
      if (world.y > bestY) {
        bestY = world.y;
        best = world;
      }
    }
    const correction = new THREE.Quaternion().setFromUnitVectors(best, new THREE.Vector3(0, 1, 0));
    dice.settleTo.copy(correction.multiply(mesh.quaternion));
  }

  collide(deltaTime, now) {
    const dice = this.state;
    const { mesh, velocity, spin, half } = dice;
    const bottom = mesh.position.y - half;

    for (const actor of this.getActors()) {
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
        spin.add(randomVector(4));
      }

      if (now - dice.lastHit > HIT_SOUND_GAP_MS) {
        dice.lastHit = now;
        playToggle();
      }
    }
  }

  containInArena({ mesh, velocity }) {
    const radial = Math.hypot(mesh.position.x, mesh.position.z);
    if (radial <= REACH) return;

    mesh.position.x *= REACH / radial;
    mesh.position.z *= REACH / radial;
    velocity.x *= -0.4;
    velocity.z *= -0.4;
  }

  resolveIfDone(dice, now) {
    if (dice.phase === 'ground' && dice.firstGround && now - dice.firstGround > FORCE_SETTLE_MS) {
      this.beginSettle(dice, now);
    }

    const restedLongEnough = dice.phase === 'rest' && now - dice.restSince > REST_MS;
    const onFloorTooLong = dice.firstGround && now - dice.firstGround > GIVE_UP_MS && dice.phase !== 'air';

    if (dice.resolve && (restedLongEnough || onFloorTooLong)) {
      const { resolve } = dice;
      dice.resolve = null;
      resolve();
    }
  }

  updateShadow({ mesh, shadow, half }) {
    const height = Math.max(0, mesh.position.y - half);
    shadow.position.x = mesh.position.x;
    shadow.position.z = mesh.position.z;
    shadow.scale.setScalar((1.4 + height * 0.25) * 1.25);
    shadow.material.opacity = Math.max(0, 1 - height / 7);
  }

  dispose() {
    const dice = this.state;
    if (!dice) return;

    this.state = null;
    this.scene.remove(dice.mesh, dice.shadow);
    dice.mesh.geometry.dispose();
    dice.materials.forEach((material) => material.dispose());
    dice.textures.forEach((texture) => texture.dispose());
    dice.shadow.geometry.dispose();
    dice.shadow.material.dispose();
    dice.resolve?.();
  }
}