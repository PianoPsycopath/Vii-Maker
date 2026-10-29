import * as THREE from 'three';

export const PLAZA_CONFIG = {
  RADIUS: 5.3,
  SPEED: 1.1,
  STEP: 4,
  SPACING: 1.0,
  MOVE_DEG: 38.17,
  MOVE_AMP: 40,
  LANE_X: 4.2,
  PARADE_MAX: 18,
  PARADE_INTERVAL: 0.55,
  PARADE_SPACING: 1.4,
  SPAWN_Z: 24,
  PARADE_SPEED: 3,
  IDLE_EVERY: [8, 20],
  IDLE_EVERY_PARADE: [10, 25],
  PARADE_DZ: -1,
  ARMS_ROT: 42.97,
  EDITOR_OFFSET: new THREE.Vector3(-2.6, 1.7, -4.2),
  EDITOR_FOV: 32
};

export const PlazaMath = {
  getRandomInt: (max) => Math.floor(Math.random() * max),
  getRandomFloat: (min, max) => min + Math.random() * (max - min),
  clamp01: (value) => Math.min(1, Math.max(0, value)),
  easeCubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  wrapAngle: (angle) => Math.atan2(Math.sin(angle), Math.cos(angle)),
  degreesToRadians: (degrees) => (degrees * Math.PI) / 180
};