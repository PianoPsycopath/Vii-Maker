import * as THREE from 'three';
import { SKINS, NOSE_STYLES, EYE_STYLES, HAIR_STYLES } from './data.js';
import { BIOME_NAMES, TEX, TINT } from './tint.js';
import { drawProfessionStandIn } from './composer.js';
import { BASE_SCALE, createPixelTexture, createStaticRig } from './rig.js';

const WIDTH = 112;
const HEIGHT = 136;

const VIEWS = {
  body: { pos: [-2.15, 1.55, -3.55], look: [0, 1.02, 0] },
  hair: { pos: [-1.05, 1.98, -1.95], look: [0, 1.76, 0] },
  eyes: { pos: [-0.26, 1.78, -1.35], look: [0, 1.74, 0] },
  nose: { pos: [-0.62, 1.5, -1.2], look: [0, 1.48, 0] }
};

const NEUTRAL = {
  biome: [0.78, 0.80, 0.79],
  hair: [0.42, 0.48, 0.47],
  eyes: [0.28, 0.36, 0.35]
};

export function paintFlatSkin(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  ctx.clearRect(32, 0, 32, 20);
  ctx.clearRect(30, 46, 34, 18);
}

/** Desaturated clay version of the base skin so layer previews read on a neutral figure. */
function createMannequin(baseImg) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!baseImg) {
    paintFlatSkin(ctx, '#bcc6c4');
    return canvas;
  }

  ctx.drawImage(baseImg, 0, 0, 64, 64);
  const image = ctx.getImageData(0, 0, 64, 64);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const luma = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    const grey = Math.round(luma * 0.45 + 128);
    px[i] = grey - 4;
    px[i + 1] = grey;
    px[i + 2] = grey - 1;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export async function renderThumbnailSets({ GEO, M, composer, noseTextures }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(2);
  renderer.setSize(WIDTH, HEIGHT, false);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 5, -4);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 30);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const texture = createPixelTexture(canvas);

  const rig = createStaticRig(GEO, texture, noseTextures);
  rig.group.scale.setScalar(BASE_SCALE);
  scene.add(rig.group);

  const baseImg = await composer.load(M.base);
  const mannequin = createMannequin(baseImg);

  const snap = () => {
    texture.needsUpdate = true;
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  };

  async function shoot(view, items, paint, { onMannequin = true } = {}) {
    camera.position.set(...view.pos);
    camera.lookAt(...view.look);

    const shots = [];
    for (let i = 0; i < items.length; i++) {
      ctx.clearRect(0, 0, 64, 64);
      if (onMannequin) ctx.drawImage(mannequin, 0, 0);
      await paint(items[i], i);
      shots.push(snap());
    }
    return shots;
  }

  try {
    const profThumbs = await shoot(VIEWS.body, M.professions, async (prof, i) => {
      if (i === 0) return;
      const layer = (await composer.load(prof.path)) || drawProfessionStandIn(prof.id, 0, false);
      if (layer) ctx.drawImage(layer, 0, 0, 64, 64);
    });

    const biomeThumbs = await shoot(VIEWS.body, BIOME_NAMES, async name => {
      const [outfit, shoes] = await Promise.all([
        composer.load(TEX.outfit(name)),
        composer.load(TEX.shoes(name))
      ]);
      if (outfit) ctx.drawImage(composer.tint(outfit, NEUTRAL.biome, TINT.outfit), 0, 0, 64, 64);
      if (shoes) ctx.drawImage(shoes, 0, 0, 64, 64);
    });

    const skinThumbs = await shoot(VIEWS.body, SKINS, (color) => {
      if (baseImg) ctx.drawImage(baseImg, 0, 0, 64, 64);
      else paintFlatSkin(ctx, color);
    }, { onMannequin: false });

    const hairThumbs = await shoot(VIEWS.hair, ['bald', ...HAIR_STYLES], async style => {
      if (style === 'bald') return;
      const hair = await composer.load(TEX.hair(style));
      if (hair) ctx.drawImage(composer.tint(hair, NEUTRAL.hair, TINT.hair), 0, 0, 64, 64);
    });

    const eyeThumbs = await shoot(VIEWS.eyes, EYE_STYLES, async style => {
      const [white, iris] = await Promise.all([
        composer.load(TEX.eyesWhite(style)),
        composer.load(TEX.eyesIris(style))
      ]);
      if (white) ctx.drawImage(white, 0, 0, 64, 64);
      if (iris) ctx.drawImage(composer.tint(iris, NEUTRAL.eyes, TINT.eyes), 0, 0, 64, 64);
    });

    const noseThumbs = await shoot(VIEWS.nose, NOSE_STYLES, (_, i) => rig.nose.setStyle(i));

    return { profThumbs, biomeThumbs, skinThumbs, hairThumbs, eyeThumbs, noseThumbs };
  } finally {
    rig.dispose();
    texture.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}