import * as THREE from 'three';
import { heightScale } from './data.js';
import { BASE_SCALE, createStaticRig } from './rig.js';

const PIXEL = 1 / 16;
const TAU = Math.PI * 2;

export const CARRY_TUNING = { size: 0.34, down: 0.2, forward: 0.34, rowGap: 0.01 };
export const LAG = { freq: 6, damping: 0.22, gain: 0.5, max: 0.18, tilt: 1.5, topLoose: 0.8 };
export const FLIGHT = { out: 760, back: 640, stagger: 100, arc: 90, land: 380, bounce: 12, landScale: 0.95 };

export const CARRY_ITEMS = [
  { id: 'edits',  model: 'barrel',  slot: [0, 1],     spin: [0.2, 1, 0.1, 1] },   // Export Edits
  { id: 'all',    model: 'shulker', slot: [0.19, 0],  spin: [0, 1, 0, 1] },       // Export All
  { id: 'import', model: 'chest',   slot: [-0.19, 0], spin: [1, 0.2, 0.2, 1] }    // Import
];

function pixelTexture(paint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  paint(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

const rect = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

function crateTexture(base, edge, light, mark) {
  return pixelTexture(ctx => {
    rect(ctx, edge, 0, 0, 16, 16);
    rect(ctx, base, 1, 1, 14, 14);
    rect(ctx, light, 1, 1, 14, 1);
    rect(ctx, light, 1, 1, 1, 14);
    if (mark) mark(ctx);
  });
}

function crate(texture) {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: texture }));
}

export const CARRY_MODELS = {
  chest: () => crate(crateTexture('#a06b2c', '#4f2f12', '#c08a45', ctx => {
    rect(ctx, '#4f2f12', 0, 6, 16, 1);
    rect(ctx, '#f0c23c', 7, 5, 2, 3);
  })),
  shulker: () => crate(crateTexture('#8e5fb8', '#4a2f6b', '#a97bd0', ctx => {
    rect(ctx, '#4a2f6b', 0, 7, 16, 2);
  })),
  barrel: () => crate(crateTexture('#9c7440', '#4a3418', '#b88f58', ctx => {
    rect(ctx, '#7d5a2f', 5, 1, 1, 14);
    rect(ctx, '#7d5a2f', 10, 1, 1, 14);
    rect(ctx, '#3d2a12', 0, 3, 16, 2);
    rect(ctx, '#3d2a12', 0, 11, 16, 2);
  }))
};

const clamp01 = v => Math.min(1, Math.max(0, v));
const easeOutCubic = p => 1 - (1 - p) ** 3;

export class ExportCarrier {
  constructor({ canvas, hoverTarget, slots = {}, GEO, texture, noseTextures, noseTexturesReady, items = CARRY_ITEMS }) {
    this.canvas = canvas;
    this.slots = slots;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    this.camera.position.set(-1.3, 1.75, -4.3);
    this.lookTarget = new THREE.Vector3(0.05, 0.98, 0);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateMatrixWorld();
    this.camRight = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.camUp = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.viewQuat = this.camera.quaternion.clone().invert();

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    this.sunPosition = new THREE.Vector3(-3, 5, -4);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.copy(this.sunPosition);
    this.scene.add(sun);

    this.rig = createStaticRig(GEO, texture, noseTextures);
    this.scene.add(this.rig.group);
    noseTexturesReady?.then(() => this.rig.nose.refresh());

    const armsBone = GEO['geometry.villager_v2']?.bones?.find(bone => bone.name === 'arms');
    const [, pivotY, pivotZ] = (armsBone?.pivot || [0, 22, 0]).map(v => v * PIXEL);
    const { size, down, forward, rowGap } = CARRY_TUNING;
    this.boxSize = size;

    this.items = items.map(spec => {
      const root = new THREE.Group();
      root.name = `carry-${spec.id}`;
      const model = CARRY_MODELS[spec.model]();
      model.name = `carry-model-${spec.model}`;
      model.scale.setScalar(size);
      root.add(model);

      const [slotX, row] = spec.slot;
      const home = new THREE.Vector3(slotX, pivotY - down + row * (size + rowGap) + size / 2, pivotZ - forward);
      root.position.copy(home);
      this.rig.group.add(root);

      return {
        id: spec.id, model: spec.model, spin: spec.spin || [0, 1, 0, 1], row, root, home,
        sp: { x: 0, y: 0, vx: 0, vy: 0 },        // spring: where the box is on screen (px)
        phase: 'home',                           // home | out | land | parked | back
        pending: null,                           // { dir, at }: a launch waiting for its turn
        fl: null,                                // the flight in progress
        cur: { x: 0, y: 0, s: 0 },               // last overlay position / size (px)
        mesh: null                               // overlay twin, built on first flight
      };
    });

    this.anchor = null;
    this.snap = true;
    this.overlay = null;
    this.overlayShown = false;
    this.overlaySig = '';
    this.panel = null;
    this.shareOpen = false;
    this.dirty = false;
    this._spin = new THREE.Quaternion();
    this._axis = new THREE.Vector3();

    this.hover = 0;
    this.hovered = false;
    for (const type of ['mouseenter', 'focus']) hoverTarget?.addEventListener(type, () => { this.hovered = true; this.start(); });
    for (const type of ['mouseleave', 'blur']) hoverTarget?.addEventListener(type, () => { this.hovered = false; });

    this.keepUntil = 0;
    this.running = false;
    this.frame = this.frame.bind(this);

    window.addEventListener('resize', () => this.resizeOverlay());
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    // One frame so the icon is there before the export tab is ever opened.
    this.renderOnce();
  }

  setHeight(t) {
    this.rig.group.scale.setScalar(heightScale(t) * BASE_SCALE);
    this.renderOnce();
  }

  setNose(styleIndex) {
    this.rig.nose.setStyle(styleIndex);
    this.renderOnce();
  }

  setActive(open, instant = false) {
    this.keepUntil = performance.now() + (instant ? 0 : 1200);
    if (instant) this.snap = true;
    this.start();
  }

  setShareOpen(open) {
    this.shareOpen = open;
    const now = performance.now();
    const count = this.items.length;

    this.items.forEach((item, i) => {
      if (open) {
        if (item.phase === 'home') item.pending = { dir: 'out', at: now + i * FLIGHT.stagger };
        else if (item.phase === 'back') item.pending = { dir: 'out', at: now };
        else item.pending = null;
      } else if (item.phase === 'home') {
        item.pending = null;
      } else if (item.phase !== 'back') {
        item.pending = { dir: 'back', at: now + (count - 1 - i) * FLIGHT.stagger };
      }
    });
    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = undefined;
    this.resize();
    this.renderer.setAnimationLoop(this.frame);
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.renderOnce();
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  }

  renderOnce() {
    if (this.running || !this.canvas.clientWidth) return;
    this.pose();
    this.renderer.render(this.scene, this.camera);
  }

  //Per frame

  frame(now) {
    const dt = Math.min(0.05, this.last === undefined ? 0 : (now - this.last) / 1000);
    this.last = now;

    this.hover += ((this.hovered ? 1 : 0) - this.hover) * 0.2;
    const lagging = this.followAnchor(dt);
    const { flying, away } = this.updateFlights(now);

    this.pose();
    if (lagging || flying || this.hovered || this.hover > 0.002 || this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
    this.drawOverlay(away);

    if (!lagging && !flying && !away && !this.hovered && this.hover < 0.002 && now > this.keepUntil) this.stop();
  }

  followAnchor(dt) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return false;
    const ax = rect.left + rect.width / 2;
    const ay = rect.top + rect.height / 2;
    const jump = this.anchor ? Math.hypot(ax - this.anchor.x, ay - this.anchor.y) : Infinity;

    if (this.snap || jump > 160) {
      this.snap = false;
      for (const { sp } of this.items) Object.assign(sp, { x: ax, y: ay, vx: 0, vy: 0 });
      this.anchor = { x: ax, y: ay };
      return false;
    }

    const steps = Math.min(20, Math.max(1, Math.ceil(dt * 240)));
    const h = dt / steps;
    let active = jump > 0.02;

    for (const item of this.items) {
      const w = TAU * LAG.freq * (item.row ? LAG.topLoose : 1);
      const k = w * w;
      const c = 2 * LAG.damping * w;
      const { sp } = item;
      for (let s = 0; s < steps; s++) {
        sp.vx += (k * (ax - sp.x) - c * sp.vx) * h;
        sp.vy += (k * (ay - sp.y) - c * sp.vy) * h;
        sp.x += sp.vx * h;
        sp.y += sp.vy * h;
      }
      if (Math.abs(sp.x - ax) > 0.03 || Math.abs(sp.y - ay) > 0.03 || Math.abs(sp.vx) + Math.abs(sp.vy) > 0.5) active = true;
    }

    this.anchor = { x: ax, y: ay };
    return active;
  }

  pose() {
    const height = this.canvas.clientHeight || 96;
    const distance = this.camera.position.distanceTo(this.lookTarget);
    const worldPerPx = (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / height;
    const scale = this.rig.group.scale.x || 1;

    for (const item of this.items) {
      let gx = 0, gy = 0;
      if (this.anchor) {
        const k = (worldPerPx * LAG.gain) / scale;
        gx = (item.sp.x - this.anchor.x) * k;
        gy = -(item.sp.y - this.anchor.y) * k;
      }
      const length = Math.hypot(gx, gy);
      if (length > LAG.max) { gx *= LAG.max / length; gy *= LAG.max / length; }

      item.root.position.copy(item.home).addScaledVector(this.camRight, gx).addScaledVector(this.camUp, gy);
      item.root.position.y += this.hover * 0.02;
      item.root.rotation.set(0, 0, gx * LAG.tilt * (item.row ? 1.2 : 1));
    }
  }


  project(local) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return { x: rect.left, y: rect.top, s: 16 };
    this.camera.updateMatrixWorld();
    this.rig.group.updateMatrixWorld(true);

    const world = this.rig.group.localToWorld(local.clone());
    const edge = world.clone().addScaledVector(this.camRight, this.boxSize * this.rig.group.scale.x);
    const centre = world.project(this.camera);
    edge.project(this.camera);
    return {
      x: rect.left + (centre.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-centre.y * 0.5 + 0.5) * rect.height,
      s: Math.abs(edge.x - centre.x) * 0.5 * rect.width
    };
  }

  homeInfo(item) {
    return this.project(item.home);
  }

  slotInfo(item) {
    const el = this.slots[item.id];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: Math.min(r.width, r.height) * FLIGHT.landScale, el };
  }

  ensureOverlay() {
    if (this.overlay) return this.overlay;

    const canvas = document.createElement('canvas');
    canvas.className = 'carry-fly';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:96;display:none;';
    document.body.append(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -3000, 3000);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.copy(this.sunPosition).applyQuaternion(this.viewQuat);
    scene.add(sun);

    for (const item of this.items) {
      item.mesh = CARRY_MODELS[item.model]();
      item.mesh.visible = false;
      scene.add(item.mesh);
    }

    this.overlay = { canvas, renderer, scene, camera };
    this.resizeOverlay();
    return this.overlay;
  }

  resizeOverlay() {
    if (!this.overlay) return;
    const { renderer, camera } = this.overlay;
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.right = width;
    camera.top = height;
    camera.updateProjectionMatrix();
    this.overlaySig = '';
  }

  launch(item, dir, now) {
    item.pending = null;
    this.ensureOverlay();

    const cap = dir === 'out' ? this.slotInfo(item) : this.homeInfo(item);
    if (!cap) {
      if (dir === 'back') this.arrive(item);
      return;
    }

    const from = item.root.visible ? this.project(item.root.position) : { ...item.cur };
    const d = cap.y - from.y;
    const rise = FLIGHT.arc + Math.max(0, -d);              
    const a = Math.sqrt(2 * rise);
    const b = Math.sqrt(2 * rise + 2 * d);
    const g = (a + b) ** 2;                                 
    const v0 = -Math.sqrt(2 * g * rise);

    item.fl = { dir, t0: now, dur: dir === 'out' ? FLIGHT.out : FLIGHT.back, from, cap, g, v0, landAt: 0 };
    item.phase = dir;
    item.root.visible = false;
    item.mesh.visible = true;
    this.place(item, from.x, from.y, from.s, 0);
  }

  arrive(item) {
    item.phase = 'home';
    item.fl = null;
    if (item.mesh) item.mesh.visible = false;
    item.root.visible = true;
    item.sp.y += 6;
    this.dirty = true;
  }

  updateFlights(now) {
    let flying = false;
    let away = false;

    for (const item of this.items) {
      if (item.pending && now >= item.pending.at) this.launch(item, item.pending.dir, now);
      if (item.pending) flying = true;
      const fl = item.fl;

      if (item.phase === 'out' || item.phase === 'back') {
        const live = item.phase === 'out' ? this.slotInfo(item) : this.homeInfo(item);
        const p = clamp01((now - fl.t0) / fl.dur);
        if (live) {
          const x = fl.from.x + (fl.cap.x - fl.from.x) * p + (live.x - fl.cap.x) * p;
          const y = fl.from.y + fl.v0 * p + 0.5 * fl.g * p * p + (live.y - fl.cap.y) * p;
          const size = THREE.MathUtils.lerp(fl.from.s, live.s, easeOutCubic(p)) * (1 + 0.3 * Math.sin(Math.PI * p));
          const turns = item.spin[3] * (item.phase === 'out' ? 1 : -1);
          this.place(item, x, y, size, TAU * turns * easeOutCubic(p));
        }
        flying = away = true;
        if (p >= 1) {
          if (item.phase === 'out') { item.phase = 'land'; fl.landAt = now; } else this.arrive(item);
        }
      } else if (item.phase === 'land') {
        const live = this.slotInfo(item);
        const tau = clamp01((now - fl.landAt) / FLIGHT.land);
        if (live) {
          const hop = FLIGHT.bounce * Math.abs(Math.sin(tau * TAU)) * (1 - tau) ** 2;
          const squash = 0.15 * (1 - tau) * Math.max(0, Math.cos(tau * 2 * TAU));
          this.place(item, live.x, live.y - hop, live.s, 0, squash);
        }
        flying = away = true;
        if (tau >= 1) item.phase = 'parked';
      } else if (item.phase === 'parked') {
        const live = this.slotInfo(item);
        if (live) {
          this.place(item, live.x, live.y, live.s, 0);
          const box = live.el.closest('.tab-content')?.getBoundingClientRect();
          item.mesh.visible = !box || (live.y > box.top - 4 && live.y < box.bottom + 4);
        }
        away = true;
      }
    }
    return { flying, away };
  }

  place(item, x, y, size, angle, squash = 0) {
    const { mesh } = item;
    mesh.position.set(x, window.innerHeight - y, 0);
    mesh.scale.set(size * (1 + squash * 0.5), size * (1 - squash), size * (1 + squash * 0.5));
    const [ax, ay, az] = item.spin;
    mesh.quaternion.copy(this.viewQuat).multiply(
      this._spin.setFromAxisAngle(this._axis.set(ax, ay, az).normalize(), angle)
    );
    item.cur.x = x;
    item.cur.y = y;
    item.cur.s = size;
  }

  drawOverlay(away) {
    if (!this.overlay) return;
    const { canvas, renderer, scene, camera } = this.overlay;

    if (!away) {
      if (this.overlayShown) { canvas.style.display = 'none'; this.overlayShown = false; }
      return;
    }
    if (!this.overlayShown) { canvas.style.display = 'block'; this.overlayShown = true; this.overlaySig = ''; }

    this.panel ??= Object.values(this.slots)[0]?.closest('.slide-panel') ?? null;
    const fade = this.panel ? getComputedStyle(this.panel).opacity : '1';
    canvas.style.opacity = fade;

    const sig = fade + this.items.map(({ mesh, cur }) =>
      `${mesh?.visible ? 1 : 0}:${Math.round(cur.x * 10)},${Math.round(cur.y * 10)},${Math.round(cur.s * 10)},${mesh ? Math.round(mesh.scale.y * 100) : 0}`
    ).join('|');
    if (sig === this.overlaySig) return;
    this.overlaySig = sig;
    renderer.render(scene, camera);
  }
}