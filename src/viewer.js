import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { heightScale, NOSE_STYLES } from './data.js';
import { PLAZA_CONFIG } from './PlazaConfig.js';
import { createComposer, loadNoseTextures } from './composer.js';
import { BASE_SCALE, createPixelTexture, createStaticRig } from './rig.js';
import { renderThumbnailSets } from './thumbnails.js';

const HOME_TARGET = new THREE.Vector3(0, 1, 0);
const FRONT_VECTOR = new THREE.Vector3(-0.3, 0.1, -1).normalize();
const FLIGHT_MS = 650;

const FOCUS_MAP = {
  full:    { home: true },
  body:    { y: 1.05, dist: 5.4 },
  outfit:  { y: 1.15, dist: 3.8 },
  hair:    { y: 1.9,  dist: 2.5 },
  face:    { y: 1.82, dist: 2.1,  front: true },
  brows:   { y: 1.92, dist: 1.6,  front: true },
  eyes:    { y: 1.85, dist: 1.55, front: true },
  glasses: { y: 1.85, dist: 1.65, front: true },
  nose:    { y: 1.6,  dist: 1.4,  front: true },
  mouth:   { y: 1.68, dist: 1.55, front: true }
};

const easeInOutCubic = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

function createFocusController(camera, controls, entity) {
  let flight = null;
  controls.addEventListener('start', () => { flight = null; });

  function focus(name, instant = false) {
    const spec = FOCUS_MAP[name] || FOCUS_MAP.full;
    let position, target;

    if (spec.home) {
      position = PLAZA_CONFIG.EDITOR_OFFSET.clone();
      target = HOME_TARGET.clone();
    } else {
      const scale = entity.scale.y;
      target = new THREE.Vector3(0, spec.y * scale, 0);
      const direction = spec.front
        ? FRONT_VECTOR.clone()
        : camera.position.clone().sub(controls.target).normalize();
      position = target.clone().addScaledVector(direction, Math.max(controls.minDistance, spec.dist * scale));
    }

    if (instant) {
      flight = null;
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      return;
    }

    flight = {
      start: performance.now(),
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition: position,
      toTarget: target
    };
  }

  function step() {
    if (!flight) return;
    const progress = Math.min(1, (performance.now() - flight.start) / FLIGHT_MS);
    const eased = easeInOutCubic(progress);
    camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
    if (progress >= 1) flight = null;
  }

  return { focus, step };
}

export function initViewer({ canvas, stageEl, spinCheckbox, GEO, M, lookups }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(PLAZA_CONFIG.EDITOR_FOV, 1, 0.1, 50);
  camera.position.copy(PLAZA_CONFIG.EDITOR_OFFSET);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME_TARGET);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1;
  controls.maxDistance = 9;
  controls.autoRotateSpeed = 1.5;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 5, -4);
  scene.add(sun);

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = textureCanvas.height = 64;
  const textureCtx = textureCanvas.getContext('2d');
  const texture = createPixelTexture(textureCanvas);

  const noseTextures = {};
  const rig = createStaticRig(GEO, texture, noseTextures);
  scene.add(rig.group);

  const resize = () => {
    const { width, height } = stageEl.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stageEl);
  resize();

  const { focus, step } = createFocusController(camera, controls, rig.group);

  renderer.setAnimationLoop(() => {
    step();
    controls.autoRotate = spinCheckbox.checked;
    controls.update();
    renderer.render(scene, camera);
  });

  const composer = createComposer({ M, lookups });

  const noseTexturesReady = loadNoseTextures(composer);
  noseTexturesReady.then(loaded => {
    Object.assign(noseTextures, loaded);
    rig.nose.refresh();
  });

  let renderToken = 0;

  async function compose(sim, pv, shiftInfoEl, statusEl) {
    const token = ++renderToken;

    shiftInfoEl.textContent =
      `${sim.mode} → Eyes: ${sim.e} · Hair: ${sim.h} · Outfit: ${sim.o} · Height: ${sim.t} · Nose: ${NOSE_STYLES[sim.n | 0]}`;

    const { layers, missing, standIn } = await composer.gather(sim, pv);
    if (token !== renderToken) return;

    composer.draw(textureCtx, layers, pv, standIn);
    texture.needsUpdate = true;

    const notes = [];
    if (missing.size) notes.push(`Missing textures: ${[...missing].join(', ')}`);
    if (standIn.size) notes.push(`Flat-color stand-ins for: ${[...standIn].join(', ')}`);
    statusEl.textContent = notes.length
      ? `${notes.join(' · ')}. Add the PNG/TGA files to see the real layers.`
      : '';
  }

  const setHeight = t => rig.group.scale.setScalar(heightScale(t) * BASE_SCALE);

  const renderThumbnails = async () =>
    renderThumbnailSets({ GEO, M, composer, noseTextures: await noseTexturesReady });

  return { compose, setHeight, setNose: rig.nose.setStyle, focus, renderThumbnails };
}