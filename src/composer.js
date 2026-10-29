import * as THREE from 'three';
import { PALETTE_35, TINT, BIOME_NAMES, TEX, hexToFloats, applyOverlayTint } from './tint.js';
import { SKINS, eyeStyle, hairStyle, hairColor, NOSE_STYLES, SKIN_TONES } from './data.js';import { parseTGA } from './tga.js';

export const PROF_THEMES = {
  farmer:        { main: '#8b5a2b', trim: '#e6c24f', style: 'overalls', hat: '#d8b45c' },
  fisherman:     { main: '#3d6b7d', trim: '#c2a878', style: 'vest',     hat: '#7a5c3e' },
  shepherd:      { main: '#e8e2d5', trim: '#8c6239', style: 'vest',     hat: '#d9d2c5' },
  fletcher:      { main: '#4a6b3b', trim: '#d9c89e', style: 'strap',    hat: '#5c4028' },
  librarian:     { main: '#8c2222', trim: '#f2ead8', style: 'stole',    hat: '#a32929' },
  cartographer:  { main: '#2d5a7b', trim: '#d4af37', style: 'strap' },
  cleric:        { main: '#6b2d7a', trim: '#d4af37', style: 'robe' },
  armorer:       { main: '#4a4e54', trim: '#9ea4ad', style: 'apron',    hat: '#686d75' },
  weapon_smith:  { main: '#383b40', trim: '#c4512d', style: 'apron' },
  tool_smith:    { main: '#4d4137', trim: '#7c858e', style: 'apron' },
  butcher:       { main: '#ececec', trim: '#b82828', style: 'apron',    band: '#b82828' },
  leatherworker: { main: '#8c4a27', trim: '#c78c56', style: 'apron' },
  stonemason:    { main: '#686c70', trim: '#a8adb3', style: 'apron' },
  nitwit:        { main: '#3b6e38', trim: '#294d26', style: 'robe' }
};

const TIER_COLORS = ['#7f8386', '#d8d8d8', '#f5cc27', '#17dd62', '#33ebcb'];

export function drawProfessionStandIn(profId, tierIdx, showTier) {
  const theme = PROF_THEMES[profId];
  if (!theme) return null;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (theme.style === 'apron') {
    ctx.fillStyle = theme.main;
    ctx.fillRect(7, 46, 6, 14);
    ctx.fillRect(23, 28, 6, 10);
    ctx.fillStyle = theme.trim;
    ctx.fillRect(7, 45, 1, 3);
    ctx.fillRect(12, 45, 1, 3);
    ctx.fillRect(0, 51, 28, 1);
  } else if (theme.style === 'overalls') {
    ctx.fillStyle = theme.main;
    ctx.fillRect(6, 48, 8, 13);
    ctx.fillRect(7, 45, 2, 4);
    ctx.fillRect(11, 45, 2, 4);
    ctx.fillRect(22, 29, 8, 9);
    ctx.fillStyle = theme.trim;
    ctx.fillRect(7, 48, 1, 1);
    ctx.fillRect(12, 48, 1, 1);
  } else if (theme.style === 'stole') {
    ctx.fillStyle = theme.trim;
    ctx.fillRect(7, 44, 6, 4);
    ctx.fillStyle = theme.main;
    ctx.fillRect(7, 44, 2, 16);
    ctx.fillRect(11, 44, 2, 16);
    ctx.fillRect(23, 26, 2, 12);
    ctx.fillRect(27, 26, 2, 12);
  } else if (theme.style === 'vest') {
    ctx.fillStyle = theme.main;
    ctx.fillRect(0, 44, 28, 12);
    ctx.clearRect(9, 44, 2, 8);
    ctx.fillStyle = theme.trim;
    ctx.fillRect(8, 44, 1, 12);
    ctx.fillRect(11, 44, 1, 12);
  } else if (theme.style === 'strap') {
    ctx.fillStyle = theme.main;
    ctx.fillRect(0, 44, 28, 14);
    ctx.fillStyle = theme.trim;
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(6 + i, 45 + i, 2, 2);
    }
  } else {
    ctx.fillStyle = theme.main;
    ctx.fillRect(0, 44, 28, 17);
    ctx.fillRect(16, 26, 28, 12);
    ctx.fillRect(44, 26, 16, 8);
    ctx.fillRect(40, 42, 16, 4);
    ctx.fillStyle = theme.trim;
    ctx.fillRect(6, 44, 8, 2);
    ctx.fillRect(0, 59, 28, 2);
  }

  if (theme.hat && profId === 'farmer') {
    ctx.fillStyle = theme.hat;
    ctx.fillRect(31, 47, 32, 16);
    ctx.fillRect(32, 0, 32, 13);
  } else if (theme.band) {
    ctx.fillStyle = theme.band;
    ctx.fillRect(32, 11, 32, 2);
  }

  if (showTier) {
    ctx.fillStyle = '#2b1d12';
    ctx.fillRect(0, 51, 28, 2);
    ctx.fillStyle = TIER_COLORS[tierIdx] || TIER_COLORS[0];
    ctx.fillRect(11, 51, 2, 3);
    ctx.fillRect(27, 33, 2, 3);
  }

  return canvas;
}

export function createComposer({ M, lookups }) {
  const { eyeHex } = lookups;
  const paletteFloats = PALETTE_35.map(hexToFloats);
  const cache = new Map();

  const loadPNG = url => new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });

  const loadTGA = async url => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return parseTGA(await response.arrayBuffer());
    } catch {
      return null;
    }
  };

  const load = path => {
    if (!path) return Promise.resolve(null);
    const cleanPath = path.replace(/\.(png|tga)$/i, '');
    
    if (!cache.has(cleanPath)) {
      cache.set(cleanPath, (async () => {
        if (cleanPath.includes('/professions/')) {
          return (await loadTGA(cleanPath + '.tga')) || (await loadPNG(cleanPath + '.png'));
        }
        return (await loadPNG(cleanPath + '.png')) || (await loadTGA(cleanPath + '.tga'));
      })());
    }
    return cache.get(cleanPath);
  };

  function tint(img, rgb, config) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 64, 64);
    
    const imgData = ctx.getImageData(0, 0, 64, 64);
    applyOverlayTint(imgData.data, rgb, config);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  async function gather(sim, pv) {
    const missing = new Set();
    const standIn = new Set();

    const eyeStyleName = eyeStyle(sim.e);
    const hairStyleName = hairStyle(sim.h);
    const colorIdx = Math.min(35, Math.max(1, hairColor(sim.h) || 1));

    const prof = M.professions[pv.prof];
    const showTier = ![0, 14].includes(pv.prof);
    const biome = BIOME_NAMES[pv.biome] || BIOME_NAMES[0];

    const [baseImg, skinImg, outfitTex, shoes, profImg, lvl, eyesWhite, irisTex, hairTex] = await Promise.all([
      load(M.base),
      load(TEX.skin),
      load(TEX.outfit(biome)),
      load(TEX.shoes(biome)),
      prof ? load(prof.path) : null,
      showTier ? load(M.levels[pv.tier]) : null,
      load(TEX.eyesWhite(eyeStyleName)),
      load(TEX.eyesIris(eyeStyleName)),
      hairStyleName !== 'bald' ? load(TEX.hair(hairStyleName)) : null
    ]);

    const handleTint = (img, path, color, cfg) => {
      if (!img) { 
        missing.add(path.split('/').slice(-2).join('/')); 
        return null; 
      }
      return tint(img, color, cfg);
    };

    const layers = [baseImg || 'skin'];
    if (baseImg) {
      const currentSkinHex = SKIN_TONES[sim.sk | 0]?.hex || '#c08469';
      layers.push(handleTint(skinImg, TEX.skin, hexToFloats(currentSkinHex), TINT.skin));
    }
    layers.push(handleTint(outfitTex, TEX.outfit(biome), paletteFloats[sim.o - 1] || paletteFloats[0], TINT.outfit));
    
    if (hairStyleName !== 'bald') {
      layers.push(handleTint(hairTex, TEX.hair(hairStyleName), paletteFloats[colorIdx - 1], TINT.hair));
    }
    
    if (shoes) layers.push(shoes);
    
    if (pv.prof !== 0) {
      if (profImg) layers.push(profImg);
      else {
        standIn.add('profession');
        layers.push(drawProfessionStandIn(prof.id, pv.tier, showTier && !lvl));
      }
    }
    
    if (eyesWhite) layers.push(eyesWhite);
    else missing.add(TEX.eyesWhite(eyeStyleName).split('/').slice(-2).join('/'));
    
    layers.push(handleTint(irisTex, TEX.eyesIris(eyeStyleName), hexToFloats(eyeHex(sim.e)), TINT.eyes));
    if (lvl) layers.push(lvl);

    return { layers, missing, standIn };
  }

  function draw(ctx, layers, pv, standIn) {
    ctx.clearRect(0, 0, 64, 64);
    for (const layer of layers) {
      if (layer === 'skin') {
        ctx.fillStyle = SKINS[pv.skin];
        ctx.fillRect(0, 0, 64, 64);
        ctx.clearRect(32, 0, 32, 20);
        ctx.clearRect(30, 46, 34, 18);
        standIn.add('base skin');
      } else if (layer) {
        ctx.drawImage(layer, 0, 0, 64, 64);
      }
    }
  }

  return { gather, draw, load, tint };
}

export async function loadNoseTextures(composer) {
  const output = {};
  const missing = [];
  
  await Promise.all(NOSE_STYLES.map(async style => {
    const img = await composer.load(TEX.nose(style));
    if (!img) { missing.push(TEX.nose(style)); return; }
    
    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    output[style] = texture;
  }));
  
  if (missing.length) {
    console.info('Nose texture(s) not found, using the skin texture for them: ' + missing.join(', '));
  }
  return output;
}