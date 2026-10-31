import * as THREE from 'three';
import { PLAZA_CONFIG, PlazaMath } from './PlazaConfig.js';

export class PlazaTransition {
  constructor(options) {
    this.camera = options.camera;
    this.selectedActor = options.selectedActor;
    this.stageElement = options.stageElement;
    this.viewportWidth = options.viewportWidth;
    this.viewportHeight = options.viewportHeight;
    this.homeTarget = options.homeTarget;
    this.onReveal = options.onReveal;
    this.onHandoff = options.onHandoff;
    this.environment = options.environment;

    const stageRect = this.stageElement.getBoundingClientRect();
    const stageCenterX = stageRect.left + stageRect.width / 2;
    const stageCenterY = stageRect.top + stageRect.height / 2;

    this.startTime = performance.now();
    this.posStart = this.camera.position.clone();
    this.targetStart = this.homeTarget.clone();
    this.fovStart = this.camera.fov;

    this.posEnd = new THREE.Vector3(this.selectedActor.x, 0, this.selectedActor.z).add(PLAZA_CONFIG.EDITOR_OFFSET);
    this.targetEnd = new THREE.Vector3(this.selectedActor.x, 1, this.selectedActor.z);

    const fovHalfRad = PlazaMath.degreesToRadians(PLAZA_CONFIG.EDITOR_FOV / 2);
    this.fovEnd = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(fovHalfRad) * (this.viewportHeight / stageRect.height)));

    this.yawStart = this.selectedActor.yaw;
    this.offsetX = this.viewportWidth / 2 - stageCenterX;
    this.offsetY = this.viewportHeight / 2 - stageCenterY;

    this.hasRevealed = false;
    this.hasHandedOff = false;
    this.isComplete = false;
  }

  update(currentTime, actors, scene) {
    const elapsedSeconds = (currentTime - this.startTime) / 1000;
    const fadeFactor = PlazaMath.clamp01(elapsedSeconds / 0.55);

    for (const actor of actors) {
      if (actor === this.selectedActor || actor.isGone) continue;
      actor.material.opacity = 1 - fadeFactor;
      actor.shadowMesh.material.opacity = 1 - fadeFactor;
      actor.tagElement.style.opacity = 1 - fadeFactor;

      if (fadeFactor >= 1) {
        actor.isGone = true;
        scene.remove(actor.root);
        actor.tagElement.remove();
      }
    }

    const floorVisibility = 1 - PlazaMath.clamp01(elapsedSeconds / 0.9);
    this.environment.setFloorOpacity(floorVisibility);

    this.selectedActor.shadowMesh.material.opacity = 1 - PlazaMath.clamp01((elapsedSeconds - 0.8) / 0.6);
    this.selectedActor.tagElement.style.opacity = 1 - PlazaMath.clamp01(elapsedSeconds / 0.35);

    const yawProgress = PlazaMath.easeCubicInOut(PlazaMath.clamp01(elapsedSeconds / 0.9));
    this.selectedActor.yaw = this.yawStart + PlazaMath.wrapAngle(0 - this.yawStart) * yawProgress;
    this.selectedActor.armBlend = 1;

    const cameraProgress = PlazaMath.easeCubicInOut(PlazaMath.clamp01((elapsedSeconds - 0.1) / 1.5));
    this.camera.position.lerpVectors(this.posStart, this.posEnd, cameraProgress);
    const currentTarget = new THREE.Vector3().lerpVectors(this.targetStart, this.targetEnd, cameraProgress);
    this.camera.fov = this.fovStart + (this.fovEnd - this.fovStart) * cameraProgress;
    this.camera.setViewOffset(
      this.viewportWidth,
      this.viewportHeight,
      this.offsetX * cameraProgress,
      this.offsetY * cameraProgress,
      this.viewportWidth,
      this.viewportHeight
    );
    this.camera.lookAt(currentTarget);

    if (!this.hasRevealed && elapsedSeconds >= 0.95) {
      this.hasRevealed = true;
      if (this.onReveal) this.onReveal();
    }

    if (!this.hasHandedOff && elapsedSeconds >= 1.75) {
      this.hasHandedOff = true;
      this.isComplete = true;
      if (this.onHandoff) this.onHandoff();
    }
  }
}

const RETURN_DURATION = 1.75;

export class PlazaReturn {
  constructor(options) {
    this.camera = options.camera;
    this.hero = options.hero;
    this.targets = options.actors.filter((actor) => actor !== this.hero);
    this.environment = options.environment;
    this.onComplete = options.onComplete;
    this.viewportWidth = options.viewportWidth;
    this.viewportHeight = options.viewportHeight;

    this.homePos = options.homePos.clone();
    this.homeTarget = options.homeTarget.clone();
    this.homeFov = options.homeFov;

    const rect = options.stageRect;
    this.posEditor = new THREE.Vector3(this.hero.x, 0, this.hero.z).add(PLAZA_CONFIG.EDITOR_OFFSET);
    this.targetEditor = new THREE.Vector3(this.hero.x, 1, this.hero.z);
    const fovHalfRad = PlazaMath.degreesToRadians(PLAZA_CONFIG.EDITOR_FOV / 2);
    this.fovEditor = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(fovHalfRad) * (this.viewportHeight / rect.height)));
    this.offsetX = this.viewportWidth / 2 - (rect.left + rect.width / 2);
    this.offsetY = this.viewportHeight / 2 - (rect.top + rect.height / 2);

    this.startTime = null;
    this.isComplete = false;
  }

  update(currentTime) {
    if (this.isComplete) return;
    if (this.startTime === null) this.startTime = currentTime;
    const elapsed = (currentTime - this.startTime) / 1000;
    if (elapsed >= RETURN_DURATION) {
      this.finish();
      return;
    }

    const f = RETURN_DURATION - elapsed;
    const others = 1 - PlazaMath.clamp01(f / 0.55);
    for (const actor of this.targets) {
      if (actor.isGone) continue;
      actor.setOpacity(others);
      actor.shadowMesh.material.opacity = others;
      actor.tagElement.style.opacity = others;
    }

    this.environment.setFloorOpacity(1 - PlazaMath.clamp01(f / 0.9));
    this.hero.shadowMesh.material.opacity = 1 - PlazaMath.clamp01((f - 0.8) / 0.6);
    this.hero.tagElement.style.opacity = 1 - PlazaMath.clamp01(f / 0.35);
    this.hero.yaw = 0;
    this.hero.armBlend = 1;

    const progress = PlazaMath.easeCubicInOut(PlazaMath.clamp01((f - 0.1) / 1.5));
    this.camera.position.lerpVectors(this.homePos, this.posEditor, progress);
    const target = new THREE.Vector3().lerpVectors(this.homeTarget, this.targetEditor, progress);
    this.camera.fov = this.homeFov + (this.fovEditor - this.homeFov) * progress;
    this.camera.setViewOffset(
      this.viewportWidth, this.viewportHeight,
      this.offsetX * progress, this.offsetY * progress,
      this.viewportWidth, this.viewportHeight
    );
    this.camera.lookAt(target);
  }

  finish() {
    this.camera.position.copy(this.homePos);
    this.camera.fov = this.homeFov;
    this.camera.clearViewOffset();
    this.camera.lookAt(this.homeTarget);

    this.environment.setFloorOpacity(1);
    for (const actor of this.targets) {
      if (actor.isGone) continue;
      actor.setOpacity(1);
      actor.shadowMesh.material.opacity = 1;
      actor.tagElement.style.opacity = '';
    }
    this.hero.shadowMesh.material.opacity = 1;
    this.hero.tagElement.style.opacity = '';

    this.isComplete = true;
    if (this.onComplete) this.onComplete();
  }
}