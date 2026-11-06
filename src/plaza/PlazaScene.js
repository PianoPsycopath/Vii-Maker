import * as THREE from 'three';
import { createComposer, loadNoseTextures } from '../composer.js';
import { playVillagerIdle } from '../sound.js';
import { VillagerActor } from '../VillagerActor.js';
import { PLAZA_CONFIG, PlazaMath } from './PlazaConfig.js';
import { PlazaEnvironment } from './PlazaEnvironment.js';
import { PlazaTransition, PlazaReturn } from './PlazaTransition.js';
import { DiceRoller } from './DiceRoller.js';
import { GustEffect } from './GustEffect.js';
import { ParadeController } from './ParadeController.js';
import { buildFreshEntries, buildRestoreEntries } from './PlazaRoster.js';

const DEFAULT_ACTOR_COUNT = 10;
const FADE_OUT_RATE = 2.5;
const FADE_IN_DISTANCE = 6;
const DISPOSE_DELAY_MS = 500;
const MAX_FRAME_SECONDS = 0.05;

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
    this.pendingReroll = [];

    this.targetCount = config.count || DEFAULT_ACTOR_COUNT;
    this.interactive = config.interactive !== false;
    this.featuredName = config.featured || null;
    this.restore = config.restore || null;

    this.onPick = config.onPick;
    this.onReveal = config.onReveal;
    this.onHandoff = config.onHandoff;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
    this.homeFov = this.camera.fov;
    this.HOME_POS = new THREE.Vector3(0, 5.6, -12.5);
    this.HOME_TARGET = new THREE.Vector3(0, 0.9, 0);
    this.camera.position.copy(this.HOME_POS);
    this.camera.lookAt(this.HOME_TARGET);

    this.actors = [];
    this.hitBoxes = [];
    this.hoverActor = null;
    this.selectedActor = null;
    this.transition = null;
    this.returnTransition = null;
    this.isDisposed = false;

    this.viewportWidth = innerWidth;
    this.viewportHeight = innerHeight;
    this.raycaster = new THREE.Raycaster();
    this.mouseNdc = new THREE.Vector2();
    this.lastRenderTime = performance.now();

    this.composer = createComposer({ M: this.manifest, lookups: this.lookups });
    this.noseTexturesReady = loadNoseTextures(this.composer);

    this.environment = new PlazaEnvironment(this.scene);
    this.shadowTexture = this.environment.shadowTexture;

    this.dice = new DiceRoller({
      scene: this.scene,
      camera: this.camera,
      shadowTexture: this.shadowTexture,
      getActors: () => this.actors,
      getViewport: () => ({ width: this.viewportWidth, height: this.viewportHeight })
    });
    this.gust = new GustEffect({ scene: this.scene, getActors: () => this.actors, dice: this.dice });
    this.parade = new ParadeController(this, !!config.parade);

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.renderLoop = this.renderLoop.bind(this);
  }

  get isParadeActive() {
    return this.parade.active;
  }

  get gustMissing() {
    return this.gust.missing;
  }

  lookup = (name) => {
    const record = this.baseLookup(name);
    const patch = this.lookOverrides.get(name);
    return record && patch ? { ...record, ...patch } : record;
  };

  async initialize() {
    addEventListener('resize', this.handleResize);
    this.handleResize();
    this.addLights();

    const entries = this.restore
      ? buildRestoreEntries(this.restore, this.baseLookup)
      : buildFreshEntries({ names: this.availableNames, count: this.targetCount, featuredName: this.featuredName });

    const built = await Promise.all(
      entries.map((entry) => this.createActor(entry.name, entry.x, entry.z, entry.yaw, entry.options))
    );
    built.forEach((actor) => this.registerActor(actor));

    const hero = built[entries.findIndex((entry) => entry.hero)] ?? null;
    if (hero) {
      hero.pinned = true;
      hero.isFrozen = true;
    }

    if (this.parade.active) this.parade.assignAll();
    if (hero) this.beginHeroReturn(hero);
    if (this.interactive) this.bindPointerEvents();

    this.renderer.setAnimationLoop(this.renderLoop);
    return this;
  }

  addLights() {
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-3, 5, -4);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5), sun);
  }

  bindPointerEvents() {
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('click', this.handleClick);
  }

  beginHeroReturn(hero) {
    const { stageRect } = this.restore;
    if (stageRect && stageRect.height > 0) this.startReturn(hero);
    else hero.isFrozen = false;
  }

  dropDice(from = null) {
    return this.dice.drop(from);
  }

  playGust(options) {
    return this.gust.play(options);
  }

  setParade(isActive) {
    this.parade.setActive(isActive);
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
        hero.pinned = false;
        hero.state = 'idle';
        hero.timer = PlazaMath.getRandomFloat(1.2, 2.5);
        if (this.parade.active) {
          this.parade.assign(hero);
        }
      }
    });
  }

  createActor(name, x, z, yaw = PlazaMath.getRandomFloat(-Math.PI, Math.PI), options = {}) {
    return new VillagerActor(name, x, z, yaw, this, options).build();
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

  handleActorSelect(actor) {
    if (this.selectedActor || this.returnTransition || !actor || actor.isDying) return;

    this.selectedActor = actor;
    actor.isFrozen = true;
    this.settleFadingActor(actor);

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
      environment: this.environment,
      onReveal: this.onReveal,
      onHandoff: () => {
        this.onHandoff?.();
        this.canvas.style.opacity = '0';
        setTimeout(() => this.dispose(), DISPOSE_DELAY_MS);
      }
    });

    for (const other of this.actors) {
      if (other === actor) continue;
      other.material.transparent = true;
      other.material.needsUpdate = true;
      other.isFrozen = false;
    }

    this.onPick?.(actor.name, actor.previewConfig, this.getRoster());
  }

  settleFadingActor(actor) {
    if (!actor.isFading) return;
    actor.isFading = false;
    actor.material.opacity = 1;
    actor.material.transparent = false;
    actor.material.needsUpdate = true;
    actor.shadowMesh.material.opacity = 1;
  }

  setHoverActor(actor) {
    if (this.selectedActor || this.hoverActor === actor) return;
    this.hoverActor?.tagElement.classList.remove('hover');
    this.hoverActor = actor;
    actor?.tagElement.classList.add('hover');
    this.canvas.style.cursor = actor ? 'pointer' : 'default';
  }

  pickActorAt(event) {
    this.mouseNdc.set(
      (event.clientX / this.viewportWidth) * 2 - 1,
      -(event.clientY / this.viewportHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.hitBoxes.filter((mesh) => !mesh.userData.actor.isGone),
      false
    )[0];
    return hit ? hit.object.userData.actor : null;
  }

  handlePointerMove(event) {
    if (!this.selectedActor && !this.returnTransition) this.setHoverActor(this.pickActorAt(event));
  }

  handlePointerLeave() {
    this.setHoverActor(null);
  }

  handleClick(event) {
    if (!this.selectedActor && !this.returnTransition) this.handleActorSelect(this.pickActorAt(event));
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
    const deltaTime = Math.min(MAX_FRAME_SECONDS, (currentTime - this.lastRenderTime) / 1000);
    this.lastRenderTime = currentTime;

    this.updateActors(deltaTime);
    this.playIdleSounds(currentTime);
    this.parade.update(currentTime);
    this.fadeOutDyingActors(deltaTime);
    this.fadeInSpawnedActors();
    this.updateReturn(currentTime);
    this.environment.update(deltaTime, this.parade.active);
    this.updateSelection(currentTime, deltaTime);
    this.dice.update(deltaTime, currentTime);
    this.gust.update(currentTime);

    this.camera.updateMatrixWorld();
    this.updateOverlays();
    this.renderer.render(this.scene, this.camera);
  }

  updateActors(deltaTime) {
    for (const actor of this.actors) {
      if (actor.isGone) continue;
      const moved = actor.isFrozen || actor === this.selectedActor
        ? 0
        : actor.calculateBehavior(deltaTime, this.actors);
      if (actor !== this.selectedActor || !this.transition) actor.updatePose(deltaTime, moved);
    }
  }

  playIdleSounds(currentTime) {
    if (!this.interactive || this.selectedActor || this.transition) return;

    const seconds = currentTime / 1000;
    const [min, max] = this.parade.active ? PLAZA_CONFIG.IDLE_EVERY_PARADE : PLAZA_CONFIG.IDLE_EVERY;

    for (const actor of this.actors) {
      if (actor.isGone || actor.isDying || actor.isFading || actor.isFrozen || seconds < actor.nextIdleTime) continue;
      actor.nextIdleTime = seconds + PlazaMath.getRandomFloat(min, max);

      const projected = actor.root.position.clone();
      projected.y += 1;
      projected.project(this.camera);

      if (Math.abs(projected.x) <= 1 && projected.z <= 1) {
        playVillagerIdle({ pan: projected.x * 0.8 });
      }
    }
  }

  fadeOutDyingActors(deltaTime) {
    for (const actor of this.actors.filter((target) => target.isDying && !target.isGone)) {
      const opacity = Math.max(0, actor.material.opacity - deltaTime * FADE_OUT_RATE);
      actor.material.opacity = opacity;
      actor.shadowMesh.material.opacity = opacity;
      actor.tagElement.style.opacity = opacity;
      if (opacity <= 0) this.retireActor(actor);
    }
  }

  fadeInSpawnedActors() {
    for (const actor of this.actors) {
      if (!actor.isFading || actor.isGone || actor === this.selectedActor) continue;

      const opacity = PlazaMath.clamp01((PLAZA_CONFIG.SPAWN_Z - actor.z) / FADE_IN_DISTANCE);
      actor.material.opacity = opacity;
      actor.shadowMesh.material.opacity = opacity;

      if (opacity >= 1) {
        actor.isFading = false;
        actor.material.transparent = false;
        actor.material.needsUpdate = true;
      }
    }
  }

  updateReturn(currentTime) {
    if (!this.returnTransition) return;
    this.returnTransition.update(currentTime);
    if (this.returnTransition.isComplete) this.returnTransition = null;
  }

  updateSelection(currentTime, deltaTime) {
    if (!this.transition) return;
    this.transition.update(currentTime, this.actors, this.scene);
    this.selectedActor.updatePose(deltaTime, 0);
  }

  updateOverlays() {
    for (const actor of this.actors) {
      if (actor.isGone) continue;

      const projected = new THREE.Vector3(actor.x, 2.35 * actor.scaleFactor, actor.z).project(this.camera);
      const screenX = (projected.x * 0.5 + 0.5) * this.viewportWidth;
      const screenY = (-projected.y * 0.5 + 0.5) * this.viewportHeight;
      actor.tagElement.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -100%)`;

      actor.noseMaterial.opacity = actor.material.opacity;
      if (actor.noseMaterial.transparent !== actor.material.transparent) {
        actor.noseMaterial.transparent = actor.material.transparent;
        actor.noseMaterial.needsUpdate = true;
      }
    }
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.renderer.setAnimationLoop(null);
    removeEventListener('resize', this.handleResize);
    this.dice.dispose();

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
    this.hintContainer?.remove();
  }
}