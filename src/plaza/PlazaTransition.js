import * as THREE from 'three';
import { PLAZA_CONFIG, PlazaMath } from './PlazaConfig.js';

const TIMING = {
  othersFade: 0.55,
  floorFade: 0.9,
  shadowDelay: 0.8,
  shadowFade: 0.6,
  tagFade: 0.35,
  yawTurn: 0.9,
  cameraDelay: 0.1,
  cameraTravel: 1.5,
  reveal: 0.95,
  handoff: 1.75
};

const scratchTarget = new THREE.Vector3();

function createEditorFraming(actor, stageRect, viewportWidth, viewportHeight) {
  const halfFov = PlazaMath.degreesToRadians(PLAZA_CONFIG.EDITOR_FOV / 2);
  return {
    position: new THREE.Vector3(actor.x, 0, actor.z).add(PLAZA_CONFIG.EDITOR_OFFSET),
    target: new THREE.Vector3(actor.x, 1, actor.z),
    fov: THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfFov) * (viewportHeight / stageRect.height))),
    offsetX: viewportWidth / 2 - (stageRect.left + stageRect.width / 2),
    offsetY: viewportHeight / 2 - (stageRect.top + stageRect.height / 2)
  };
}

function blendCamera(camera, from, framing, progress, viewportWidth, viewportHeight) {
  camera.position.lerpVectors(from.position, framing.position, progress);
  scratchTarget.lerpVectors(from.target, framing.target, progress);
  camera.fov = from.fov + (framing.fov - from.fov) * progress;
  camera.setViewOffset(
    viewportWidth,
    viewportHeight,
    framing.offsetX * progress,
    framing.offsetY * progress,
    viewportWidth,
    viewportHeight
  );
  camera.lookAt(scratchTarget);
}

export class PlazaTransition {
  constructor({
    camera, selectedActor, stageElement, viewportWidth, viewportHeight,
    homeTarget, onReveal, onHandoff, environment
  }) {
    this.camera = camera;
    this.selectedActor = selectedActor;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.onReveal = onReveal;
    this.onHandoff = onHandoff;
    this.environment = environment;

    this.framing = createEditorFraming(
      selectedActor,
      stageElement.getBoundingClientRect(),
      viewportWidth,
      viewportHeight
    );
    this.origin = {
      position: camera.position.clone(),
      target: homeTarget.clone(),
      fov: camera.fov
    };

    this.startTime = performance.now();
    this.yawStart = selectedActor.yaw;
    this.hasRevealed = false;
    this.hasHandedOff = false;
    this.isComplete = false;
  }

  update(currentTime, actors, scene) {
    const elapsed = (currentTime - this.startTime) / 1000;

    this.fadeOthers(elapsed, actors, scene);
    this.environment.setFloorOpacity(1 - PlazaMath.clamp01(elapsed / TIMING.floorFade));
    this.updateSelected(elapsed);

    const progress = PlazaMath.easeCubicInOut(
      PlazaMath.clamp01((elapsed - TIMING.cameraDelay) / TIMING.cameraTravel)
    );
    blendCamera(this.camera, this.origin, this.framing, progress, this.viewportWidth, this.viewportHeight);

    if (!this.hasRevealed && elapsed >= TIMING.reveal) {
      this.hasRevealed = true;
      this.onReveal?.();
    }
    if (!this.hasHandedOff && elapsed >= TIMING.handoff) {
      this.hasHandedOff = true;
      this.isComplete = true;
      this.onHandoff?.();
    }
  }

  fadeOthers(elapsed, actors, scene) {
    const fade = PlazaMath.clamp01(elapsed / TIMING.othersFade);

    for (const actor of actors) {
      if (actor === this.selectedActor || actor.isGone) continue;
      actor.material.opacity = 1 - fade;
      actor.shadowMesh.material.opacity = 1 - fade;
      actor.tagElement.style.opacity = 1 - fade;

      if (fade >= 1) {
        actor.isGone = true;
        scene.remove(actor.root);
        actor.tagElement.remove();
      }
    }
  }

  updateSelected(elapsed) {
    const actor = this.selectedActor;
    const yawProgress = PlazaMath.easeCubicInOut(PlazaMath.clamp01(elapsed / TIMING.yawTurn));

    actor.shadowMesh.material.opacity = 1 - PlazaMath.clamp01((elapsed - TIMING.shadowDelay) / TIMING.shadowFade);
    actor.tagElement.style.opacity = 1 - PlazaMath.clamp01(elapsed / TIMING.tagFade);
    actor.yaw = this.yawStart + PlazaMath.wrapAngle(-this.yawStart) * yawProgress;
    actor.armBlend = 1;
  }
}

export class PlazaReturn {
  constructor({
    camera, hero, actors, environment, onComplete,
    viewportWidth, viewportHeight, stageRect, homePos, homeTarget, homeFov
  }) {
    this.camera = camera;
    this.hero = hero;
    this.targets = actors.filter((actor) => actor !== hero);
    this.environment = environment;
    this.onComplete = onComplete;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;

    this.home = { position: homePos.clone(), target: homeTarget.clone(), fov: homeFov };
    this.framing = createEditorFraming(hero, stageRect, viewportWidth, viewportHeight);

    this.startTime = null;
    this.isComplete = false;
  }

  update(currentTime) {
    if (this.isComplete) return;
    if (this.startTime === null) this.startTime = currentTime;

    const elapsed = (currentTime - this.startTime) / 1000;
    if (elapsed >= TIMING.handoff) {
      this.finish();
      return;
    }

    const remaining = TIMING.handoff - elapsed;
    this.fadeInOthers(remaining);
    this.environment.setFloorOpacity(1 - PlazaMath.clamp01(remaining / TIMING.floorFade));
    this.updateHero(remaining);

    const progress = PlazaMath.easeCubicInOut(
      PlazaMath.clamp01((remaining - TIMING.cameraDelay) / TIMING.cameraTravel)
    );
    blendCamera(this.camera, this.home, this.framing, progress, this.viewportWidth, this.viewportHeight);
  }

  fadeInOthers(remaining) {
    const opacity = 1 - PlazaMath.clamp01(remaining / TIMING.othersFade);

    for (const actor of this.targets) {
      if (actor.isGone) continue;
      actor.setOpacity(opacity);
      actor.shadowMesh.material.opacity = opacity;
      actor.tagElement.style.opacity = opacity;
    }
  }

  updateHero(remaining) {
    const { hero } = this;
    hero.shadowMesh.material.opacity = 1 - PlazaMath.clamp01((remaining - TIMING.shadowDelay) / TIMING.shadowFade);
    hero.tagElement.style.opacity = 1 - PlazaMath.clamp01(remaining / TIMING.tagFade);
    hero.yaw = 0;
    hero.armBlend = 1;
  }

  finish() {
    const { camera, home } = this;
    camera.position.copy(home.position);
    camera.fov = home.fov;
    camera.clearViewOffset();
    camera.lookAt(home.target);

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
    this.onComplete?.();
  }
}