import * as THREE from 'three';
import { buildVillagerGeometry, createNoseRig } from './geometry.js';
import { PLAZA_CONFIG } from './PlazaConfig.js';

export const BASE_SCALE = 0.9375;

const PIXEL = 1 / 16;

export function createPixelTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  return texture;
}

export function createEntityMaterial(map) {
  return new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
}

/** Every bone except the nose and the ones listed in `exclude`, as one static mesh. */
export function createBodyMesh(geoData, material, exclude = []) {
  const skipped = new Set(['nose', ...exclude]);
  return new THREE.Mesh(buildVillagerGeometry(geoData, name => !skipped.has(name)), material);
}

/** One bone as its own pivoting group, so it can be rotated around the bone's pivot. */
export function createBonePart(geoData, material, boneName) {
  const bone = geoData['geometry.villager_v2'].bones.find(b => b.name === boneName);
  const pivot = (bone?.pivot || [0, 0, 0]).map(v => v * PIXEL);

  const mesh = new THREE.Mesh(buildVillagerGeometry(geoData, name => name === boneName), material);
  mesh.position.set(-pivot[0], -pivot[1], -pivot[2]);

  const group = new THREE.Group();
  group.position.set(...pivot);
  group.add(mesh);
  return { group, pivot };
}

/** Posed villager (arms tilted like the editor shot) sharing one texture. */
export function createStaticRig(geoData, texture, noseTextures = {}) {
  const material = createEntityMaterial(texture);
  const noseMaterial = createEntityMaterial(texture);

  const body = createBodyMesh(geoData, material, ['arms']);

  const arms = createBonePart(geoData, material, 'arms');
  const [px, py, pz] = arms.pivot;
  arms.group.position.set(px, py - PIXEL, pz - PIXEL);
  arms.group.rotation.x = THREE.MathUtils.degToRad(PLAZA_CONFIG.ARMS_ROT);

  const nose = createNoseRig(geoData, noseMaterial, noseTextures);
  nose.setStyle(0);

  const group = new THREE.Group();
  group.add(body, arms.group, nose.group);

  const dispose = () => {
    group.traverse(object => object.geometry?.dispose());
    material.dispose();
    noseMaterial.dispose();
  };

  return { group, nose, dispose };
}