import * as THREE from 'three';
import { computeInGameLook, heightScale } from './data.js';
import { createNoseRig } from './geometry.js';
import { PLAZA_CONFIG, PlazaMath } from './PlazaConfig.js';
import { BASE_SCALE, createBodyMesh, createBonePart, createEntityMaterial, createPixelTexture } from './rig.js';

const PREVIEW_RANGE = { prof: 15, biome: 7, tier: 5, skin: 6 };
const TARGET_ATTEMPTS = 8;
const MIN_TARGET_DISTANCE = 1.5;
const ARRIVAL_DISTANCE = 0.15;
const TURN_RATE = 4.5;
const FACING_TOLERANCE = 0.6;
const PIXEL = 1 / 16;

export class VillagerActor {
  constructor(name, startX, startZ, startYaw, sceneContext) {
    this.name = name;
    this.x = startX;
    this.z = startZ;
    this.yaw = startYaw;
    this.targetX = startX;
    this.targetZ = startZ;
    this.state = 'idle';

    this.timer = PlazaMath.getRandomFloat(0.2, 2.5);
    this.speedMultiplier = PlazaMath.getRandomFloat(0.9, 1.25);
    this.distanceWalked = PlazaMath.getRandomFloat(0, 20);
    this.walkAmplitude = 0;
    this.armBlend = 1;
    this.nextIdleTime = performance.now() / 1000 + PlazaMath.getRandomFloat(2, PLAZA_CONFIG.IDLE_EVERY[1]);

    this.isFrozen = false;
    this.isGone = false;
    this.isParade = false;
    this.isFree = false;
    this.isFading = false;
    this.isDying = false;

    this.sceneContext = sceneContext;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
  }

  async build() {
    const { composer, noseTexturesReady, lookup } = this.sceneContext;
    const noseTextures = await noseTexturesReady;

    this.record = lookup(this.name);
    this.previewConfig = {
      prof: PlazaMath.getRandomInt(PREVIEW_RANGE.prof),
      biome: PlazaMath.getRandomInt(PREVIEW_RANGE.biome),
      tier: PlazaMath.getRandomInt(PREVIEW_RANGE.tier),
      skin: PlazaMath.getRandomInt(PREVIEW_RANGE.skin)
    };
    this.simulation = computeInGameLook(
      this.name, this.record, this.previewConfig.prof, this.previewConfig.skin, this.previewConfig.biome, true
    );

    this.scaleFactor = heightScale(this.simulation.t) * BASE_SCALE;
    this.body.scale.setScalar(this.scaleFactor);

    this.buildBody(noseTextures);
    this.buildShadow();
    this.buildHitBox();
    this.buildTag();

    const { layers, standIn } = await composer.gather(this.simulation, this.previewConfig);
    composer.draw(this.textureCanvas.getContext('2d'), layers, this.previewConfig, standIn);
    this.texture.needsUpdate = true;

    return this;
  }

  buildBody(noseTextures) {
    const { geometryData } = this.sceneContext;

    this.textureCanvas = document.createElement('canvas');
    this.textureCanvas.width = this.textureCanvas.height = 64;
    this.texture = createPixelTexture(this.textureCanvas);
    this.material = createEntityMaterial(this.texture);
    this.noseMaterial = createEntityMaterial(this.texture);

    this.body.add(createBodyMesh(geometryData, this.material, ['arms', 'leg0', 'leg1']));

    this.noseRig = createNoseRig(geometryData, this.noseMaterial, noseTextures);
    this.noseRig.setStyle(this.simulation.n);
    this.body.add(this.noseRig.group);

    for (const bone of ['arms', 'leg0', 'leg1']) {
      const part = createBonePart(geometryData, this.material, bone);
      this.body.add(part.group);
      this[bone] = part;
    }
  }

  buildShadow() {
    this.shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: this.sceneContext.shadowTexture, transparent: true, depthWrite: false })
    );
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.03;
    this.shadowMesh.renderOrder = -1;
    this.root.add(this.shadowMesh);
  }

  buildHitBox() {
    this.hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.3 * this.scaleFactor, 1.1),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitBox.position.y = 1.15 * this.scaleFactor;
    this.hitBox.userData.actor = this;
    this.root.add(this.hitBox);
  }

  buildTag() {
    const scene = this.sceneContext;

    this.tagElement = document.createElement('button');
    this.tagElement.type = 'button';
    this.tagElement.className = 'plaza-tag';
    this.tagElement.textContent = this.name;
    if (this.record.s) this.tagElement.classList.add('special');

    this.tagElement.addEventListener('click', () => scene.handleActorSelect(this));
    this.tagElement.addEventListener('mouseenter', () => scene.setHoverActor(this));
    this.tagElement.addEventListener('mouseleave', () => scene.setHoverActor(null));
  }

  /** Keeps the body and nose materials in lockstep; they are separate so the nose can swap textures. */
  setOpacity(value) {
    const transparent = value < 1;
    for (const material of [this.material, this.noseMaterial]) {
      material.opacity = value;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
    }
  }

  assignRandomTarget() {
    for (let attempt = 0; attempt < TARGET_ATTEMPTS; attempt++) {
      const angle = PlazaMath.getRandomFloat(0, Math.PI * 2);
      const radius = Math.sqrt(Math.random()) * PLAZA_CONFIG.RADIUS;
      this.targetX = Math.cos(angle) * radius;
      this.targetZ = Math.sin(angle) * radius;
      if (Math.hypot(this.targetX - this.x, this.targetZ - this.z) > MIN_TARGET_DISTANCE) break;
    }
    this.state = 'walk';
  }

  calculateBehavior(deltaTime, sceneActors) {
    let distanceMoved = 0;
    if (this.isParade && this.state === 'idle') this.state = 'walk';

    if (this.state === 'idle') {
      this.timer -= deltaTime;
      if (this.timer <= 0) this.assignRandomTarget();
    } else {
      const dx = this.targetX - this.x;
      const dz = this.targetZ - this.z;
      const remaining = Math.hypot(dx, dz);

      if (remaining < ARRIVAL_DISTANCE) {
        this.state = 'idle';
        this.timer = PlazaMath.getRandomFloat(1.2, 4);
      } else {
        const turn = PlazaMath.wrapAngle(Math.atan2(-dx, -dz) - this.yaw);
        this.yaw += Math.sign(turn) * Math.min(Math.abs(turn), TURN_RATE * deltaTime);

        if (Math.abs(turn) < FACING_TOLERANCE) {
          distanceMoved = Math.min(PLAZA_CONFIG.SPEED * this.speedMultiplier * deltaTime, remaining);
          this.x -= Math.sin(this.yaw) * distanceMoved;
          this.z -= Math.cos(this.yaw) * distanceMoved;
        }
      }
    }

    this.applyCollisionAvoidance(deltaTime, sceneActors);
    this.constrainToPlazaBounds();
    return distanceMoved;
  }

  applyCollisionAvoidance(deltaTime, sceneActors) {
    const spacing = this.isParade ? PLAZA_CONFIG.PARADE_SPACING : PLAZA_CONFIG.SPACING;
    const blend = Math.min(1, deltaTime * 4);

    for (const other of sceneActors) {
      if (other === this || other.isGone) continue;

      const dx = this.x - other.x;
      const dz = this.z - other.z;
      const distance = Math.hypot(dx, dz);

      if (distance > 0 && distance < spacing) {
        const push = (spacing - distance) * blend;
        this.x += (dx / distance) * push;
        this.z += (dz / distance) * push;
      }
    }
  }

  constrainToPlazaBounds() {
    const radial = Math.hypot(this.x, this.z);
    const limit = PLAZA_CONFIG.RADIUS + 0.3;

    if (this.isFree) {
      if (!this.isParade && radial <= PLAZA_CONFIG.RADIUS) this.isFree = false;
    } else if (radial > limit) {
      this.x *= limit / radial;
      this.z *= limit / radial;
    }
  }

  updatePose(deltaTime, distanceMoved) {
    this.distanceWalked += distanceMoved * PLAZA_CONFIG.STEP;
    this.walkAmplitude += ((distanceMoved > 0 ? 1 : 0) - this.walkAmplitude) * Math.min(1, deltaTime * 8);

    const cycle = PlazaMath.degreesToRadians(this.distanceWalked * PLAZA_CONFIG.MOVE_DEG);
    const swing = phase =>
      -PlazaMath.degreesToRadians(Math.cos(phase) * PLAZA_CONFIG.MOVE_AMP) * this.walkAmplitude;

    // Bedrock rx is the inverse of three.js rotation.x, hence the negation.
    this.leg0.group.rotation.x = swing(cycle);
    this.leg1.group.rotation.x = swing(cycle + Math.PI);

    const [px, py, pz] = this.arms.pivot;
    const armOffset = this.armBlend * PIXEL;
    this.arms.group.rotation.x = PlazaMath.degreesToRadians(PLAZA_CONFIG.ARMS_ROT) * this.armBlend;
    this.arms.group.position.set(px, py - armOffset, pz - armOffset);

    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.yaw;
  }

  dispose() {
    this.root.traverse(object => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    this.texture.dispose();
    this.tagElement.remove();
  }
}