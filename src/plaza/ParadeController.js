import * as THREE from 'three';
import { PLAZA_CONFIG, PlazaMath } from './PlazaConfig.js';

const LANE_STEP = 0.618034;
const LANE_ATTEMPTS = 5;
const LANE_CLEARANCE = 1.6;
const OFFSCREEN_BOTTOM = -1.2;
const OFFSCREEN_SIDE = 1.3;

export class ParadeController {
  constructor(scene, active) {
    this.scene = scene;
    this.active = active;
    this.pendingNames = new Set();
    this.laneSequence = Math.random();
    this.lastSpawnTime = 0;
  }

  setActive(isActive) {
    const { scene } = this;
    if (scene.selectedActor || this.active === !!isActive) return;
    this.active = !!isActive;

    for (const actor of scene.actors) {
      if (actor.isGone || actor.pinned) continue;
      if (this.active) this.assign(actor);
      else this.release(actor);
    }

    if (!isActive) this.retireSurplus();
  }

  assignAll() {
    for (const actor of this.scene.actors) {
      if (!actor.isGone && !actor.pinned) this.assign(actor);
    }
  }

  assign(actor) {
    actor.isParade = true;
    actor.isFree = true;
    actor.state = 'walk';
    actor.speedMultiplier = PLAZA_CONFIG.PARADE_SPEED * PlazaMath.getRandomFloat(0.98, 1.04);
    actor.targetX = Math.max(-PLAZA_CONFIG.LANE_X, Math.min(PLAZA_CONFIG.LANE_X, actor.x));
    actor.targetZ = actor.z + PLAZA_CONFIG.PARADE_DZ * 60;
  }

  release(actor) {
    actor.isParade = false;
    actor.speedMultiplier = PlazaMath.getRandomFloat(0.9, 1.25);
    actor.assignRandomTarget();
  }

  retireSurplus() {
    const { actors, targetCount } = this.scene;

    actors
      .filter((actor) => !actor.pinned)
      .sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))
      .slice(0, Math.max(0, actors.length - targetCount))
      .forEach((actor) => {
        actor.isDying = true;
        actor.isFading = false;
        actor.material.transparent = true;
      });
  }

  update(currentTime) {
    const { scene } = this;
    if (!this.active || scene.selectedActor) return;

    scene.actors
      .filter((actor) => actor.isParade && this.isOffscreen(actor))
      .forEach((actor) => scene.retireActor(actor));

    const interval = PLAZA_CONFIG.PARADE_INTERVAL * 1000;
    const hasRoom = scene.actors.length + this.pendingNames.size < PLAZA_CONFIG.PARADE_MAX;

    if (!scene.returnTransition && hasRoom && currentTime - this.lastSpawnTime >= interval) {
      this.lastSpawnTime = Math.max(this.lastSpawnTime + interval, currentTime - interval);
      this.spawn();
    }
  }

  isOffscreen(actor) {
    if (actor.z > 0) return false;
    const projected = new THREE.Vector3(actor.x, 2.5 * actor.scaleFactor, actor.z).project(this.scene.camera);
    return projected.y < OFFSCREEN_BOTTOM || Math.abs(projected.x) > OFFSCREEN_SIDE;
  }

  nextLane() {
    this.laneSequence = (this.laneSequence + LANE_STEP) % 1;
    return (this.laneSequence * 2 - 1) * PLAZA_CONFIG.LANE_X;
  }

  pickFreeLane() {
    const { actors } = this.scene;
    const isClear = (laneX) =>
      actors.every((actor) => Math.hypot(actor.x - laneX, (actor.z - PLAZA_CONFIG.SPAWN_Z) * 0.35) > LANE_CLEARANCE);

    let laneX = this.nextLane();
    for (let i = 0; i < LANE_ATTEMPTS && !isClear(laneX); i++) laneX = this.nextLane();
    return laneX;
  }

  async spawn() {
    const { scene } = this;
    const liveNames = new Set([...scene.actors.map((actor) => actor.name), ...this.pendingNames]);
    const freeNames = scene.availableNames.filter((name) => !liveNames.has(name));
    if (!freeNames.length) return;

    const name = freeNames[PlazaMath.getRandomInt(freeNames.length)];
    this.pendingNames.add(name);

    try {
      const actor = await scene.createActor(
        name,
        this.pickFreeLane(),
        PLAZA_CONFIG.SPAWN_Z,
        Math.atan2(0, -PLAZA_CONFIG.PARADE_DZ)
      );
      actor.isFading = true;
      actor.material.transparent = true;
      actor.material.opacity = 0;
      actor.shadowMesh.material.opacity = 0;

      if (scene.isDisposed || scene.selectedActor || !this.active) {
        actor.dispose();
        return;
      }

      scene.registerActor(actor);
      this.assign(actor);
    } finally {
      this.pendingNames.delete(name);
    }
  }
}