import { computeInGameLook, NOSE_STYLES, noseGeoName } from './data.js';
import { BIOME_NAMES, TEX } from './tint.js';
import { loadTextures } from './packExport.js';

export const PACK_ICON_VILLAGER = { name: 'Joshua', profession: 'farmer', biome: 'plains', skin: 0 };

const ICON_SIZE = 256;
const FACE_PIXEL_SCALE = 20;
const FACE_SIZE = { w: 8, h: 12 };
const HEAD_FRONT = { x: 8, y: 8, w: 8, h: 10 };
const HELMET_FRONT = { x: 40, y: 8, w: 8, h: 10 };
const HEAD_TOP = 34;
const HEAD_HALF_WIDTH = 4;

const createCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
};

/** Front faces of the nose cubes, as source rects in the nose texture and dest rects on the face. */
export function noseFaceRects(geometry) {
  const bone = geometry?.bones?.find(b => b.name === 'nose');
  return (bone?.cubes || []).map(({ origin: [ox, oy], size: [sx, sy, sz], uv: [u, v], inflate = 0 }) => ({
    source: { x: u + sz, y: v + sz, w: sx, h: sy },
    dest: {
      x: Math.round(HEAD_HALF_WIDTH + ox - inflate),
      y: Math.round(HEAD_TOP - (oy + sy + inflate)),
      w: Math.round(sx + inflate * 2),
      h: Math.round(sy + inflate * 2)
    }
  }));
}

async function loadNoseBitmap(style) {
  const { files } = await loadTextures([TEX.nose(style)]);
  const [file, bytes] = Object.entries(files)[0] || [];
  if (!file?.endsWith('.png')) return null;
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
}

/**
 * Renders the face of the configured villager as a 256×256 PNG.
 * Returns null when the villager or its profession/biome can't be found.
 */
export async function generatePackIcon({ GEO, M, composer, lookup }) {
  const { name, profession, biome: biomeName, skin } = PACK_ICON_VILLAGER;
  const record = lookup(name);
  const prof = M.professions.findIndex(p => p.id === profession);
  const biome = BIOME_NAMES.indexOf(biomeName);
  if (!record || prof < 0 || biome < 0) return null;

  const config = { prof, biome, tier: 0, skin };
  const look = computeInGameLook(name, record, prof, skin, biome, true);

  const texture = createCanvas(64, 64);
  const { layers, standIn } = await composer.gather(look, config);
  composer.draw(texture.ctx, layers, config, standIn);

  const face = createCanvas(FACE_SIZE.w, FACE_SIZE.h);
  for (const { x, y, w, h } of [HEAD_FRONT, HELMET_FRONT]) {
    face.ctx.drawImage(texture.canvas, x, y, w, h, 0, 0, w, h);
  }

  const noseStyle = NOSE_STYLES[look.n | 0];
  const noseRects = noseFaceRects(GEO[noseGeoName(noseStyle)]);
  const noseBitmap = noseRects.length ? await loadNoseBitmap(noseStyle) : null;
  if (noseBitmap) {
    for (const { source: s, dest: d } of noseRects) {
      face.ctx.drawImage(noseBitmap, s.x, s.y, s.w, s.h, d.x, d.y, d.w, d.h);
    }
  }

  const icon = createCanvas(ICON_SIZE, ICON_SIZE);
  const width = FACE_SIZE.w * FACE_PIXEL_SCALE;
  const height = FACE_SIZE.h * FACE_PIXEL_SCALE;
  icon.ctx.drawImage(face.canvas, (ICON_SIZE - width) / 2, (ICON_SIZE - height) / 2, width, height);

  const blob = await new Promise(resolve => icon.canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}