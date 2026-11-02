import * as THREE from 'three';
import { PLAZA_CONFIG } from './PlazaConfig.js';

export class PlazaEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.floorGroup = new THREE.Group();
    this.floorMaterials = [];
    this.stripMaterials = [];
    this.shadowTexture = null;

    this.stripBlend = 0;
    this.floorFade = 1;

    this.buildFloorGeometry();
    this.buildShadowTexture();
    this.scene.add(this.floorGroup);
  }

  buildFloorGeometry() {
    const addDisc = (geometry, color, y) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.renderOrder = -2;
      this.floorGroup.add(mesh);
      this.floorMaterials.push(material);
    };

    addDisc(new THREE.CircleGeometry(6.9, 72), '#b9cbc8', 0);
    addDisc(new THREE.CircleGeometry(6.55, 72), '#e6f6f0', 0.01);
    addDisc(new THREE.RingGeometry(3.2, 3.32, 72), '#cfe7de', 0.02);

    const runwayConfigs = [
      ['#b9cbc8', PLAZA_CONFIG.LANE_X * 2 + 2.6, 0, -4],
      ['#e6f6f0', PLAZA_CONFIG.LANE_X * 2 + 2.2, 0.005, -3]
    ];

    for (const [color, width, y, order] of runwayConfigs) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 120), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.renderOrder = order;
      this.floorGroup.add(mesh);
      this.stripMaterials.push(material);
    }
  }

  buildShadowTexture() {
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const ctx = shadowCanvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(60,90,85,.45)');
    gradient.addColorStop(1, 'rgba(60,90,85,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    this.shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  }

  update(deltaTime, isParadeActive) {
    this.stripBlend += ((isParadeActive ? 1 : 0) - this.stripBlend) * Math.min(1, deltaTime * 4);
    for (const material of this.stripMaterials) {
      material.opacity = this.stripBlend * this.floorFade;
    }
  }

  setFloorOpacity(opacity) {
    this.floorFade = opacity;
    for (const material of this.floorMaterials) {
      material.opacity = opacity;
    }
    this.floorGroup.visible = opacity > 0;
  }

  dispose() {
    if (this.shadowTexture) this.shadowTexture.dispose();
    this.floorGroup.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    this.scene.remove(this.floorGroup);
  }
}