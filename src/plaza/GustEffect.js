import * as THREE from 'three';
import { PLAZA_CONFIG, PlazaMath } from './PlazaConfig.js';

const TEXTURE_PATHS = ['img/gust.png', 'img/icons/gust.png', 'img/fx/gust.png', 'data/gust.png', 'gust.png'];
const SPRITE_RENDER_ORDER = 20;
const DICE_SIZE_SCALE = 0.7;
const ACTOR_CENTER_HEIGHT = 1.05;

async function loadFirstTexture(base) {
  const loader = new THREE.TextureLoader();
  for (const path of TEXTURE_PATHS) {
    try {
      return await loader.loadAsync(`${base}${path}`);
    } catch {}
  }
  throw new Error('not found in img/, img/icons/ or the site root');
}

export class GustEffect {
  constructor({ scene, getActors, dice }) {
    this.scene = scene;
    this.getActors = getActors;
    this.dice = dice;
    this.missing = false;
    this.instances = [];
    this.playback = null;
    this.ready = this.load();
  }

  async load() {
    try {
      const texture = await loadFirstTexture(import.meta.env.BASE_URL);
      const { width, height } = texture.image;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      return { texture, frames: PLAZA_CONFIG.GUST_FRAMES || Math.max(1, Math.round(width / height)) };
    } catch (error) {
      console.error('gust.png could not be loaded; randomizing without the gust', error);
      this.missing = true;
      return null;
    }
  }

  collectTargets() {
    const targets = this.getActors()
      .filter((actor) => !actor.isGone && !actor.isDying)
      .map((actor) => ({
        locate: () => {
          const live = this.getActors().find((other) => other.name === actor.name && !other.isGone) || actor;
          return {
            x: live.x,
            y: ACTOR_CENTER_HEIGHT * live.scaleFactor,
            z: live.z,
            size: PLAZA_CONFIG.GUST_SIZE * live.scaleFactor
          };
        }
      }));

    const { mesh } = this.dice;
    if (mesh) {
      targets.push({
        locate: () => ({
          x: mesh.position.x,
          y: mesh.position.y,
          z: mesh.position.z,
          size: PLAZA_CONFIG.GUST_SIZE * DICE_SIZE_SCALE
        })
      });
    }
    return targets;
  }

  createInstance(target, gust, start) {
    const material = new THREE.SpriteMaterial({
      map: gust.texture.clone(),
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    material.map.repeat.set(1 / gust.frames, 1);

    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = SPRITE_RENDER_ORDER;
    sprite.visible = false;
    this.scene.add(sprite);
    return { target, sprite, material, start };
  }

  play({ onPeak } = {}) {
    return this.ready.then((gust) => new Promise((resolve) => {
      const targets = this.collectTargets();

      if (!gust || !targets.length) {
        this.dice.dispose();
        onPeak?.();
        resolve();
        return;
      }

      const { GUST_FPS, GUST_STAGGER, GUST_PEAK } = PLAZA_CONFIG;
      const frameTime = 1000 / GUST_FPS;
      const now = performance.now();

      this.instances = targets.map((target) =>
        this.createInstance(target, gust, now + PlazaMath.getRandomFloat(0, GUST_STAGGER) * 1000)
      );

      this.playback = {
        frames: gust.frames,
        frameTime,
        peakAt: Math.floor(gust.frames * GUST_PEAK) * frameTime,
        onPeak: () => {
          this.dice.dispose();
          onPeak?.();
        },
        resolve,
        peaked: false
      };
    }));
  }

  update(now) {
    const playback = this.playback;
    if (!playback) return;

    if (!playback.peaked && this.instances.every((gust) => now - gust.start >= playback.peakAt)) {
      playback.peaked = true;
      try {
        playback.onPeak();
      } catch (error) {
        console.error('Gust peak callback failed', error);
      }
    }

    let running = 0;
    for (const gust of this.instances) {
      const frame = Math.floor((now - gust.start) / playback.frameTime);
      if (frame >= playback.frames) {
        gust.sprite.visible = false;
        continue;
      }
      running++;
      if (frame < 0) continue;

      const where = gust.target.locate();
      gust.material.map.offset.x = frame / playback.frames;
      gust.sprite.position.set(where.x, where.y, where.z);
      gust.sprite.scale.setScalar(where.size);
      gust.sprite.visible = true;
    }

    if (running === 0) this.finish(playback);
  }

  finish(playback) {
    for (const gust of this.instances) {
      this.scene.remove(gust.sprite);
      gust.material.map.dispose();
      gust.material.dispose();
    }
    this.instances = [];
    this.playback = null;
    playback.resolve();
  }
}