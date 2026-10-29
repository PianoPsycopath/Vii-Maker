export const clamp = (v, a, b) => Math.max(a, Math.min(b, v | 0));

export const HEX = {
  'very-light-blonde': '#f6efc8', 'medium-light-blonde': '#ead58e', 'light-blonde': '#f1e0a0',
  'medium-blonde': '#d6b765', 'dark-blonde': '#b8913f', 'vibrant-orange': '#e8801f',
  'soft-blonde': '#dcc58e', 'soft-magenta': '#b8739a', 'copper-red': '#b5562a',
  'light-red': '#c9602f', 'auburn-red': '#8a3a1e', 'dark-red': '#6b1f17',
  'light-brown': '#9a6b3f', 'medium-brown': '#7a4f2c', 'white': '#f4f4f4',
  'dark-brown': '#4e321d', 'deep-brown': '#34200f', 'soft-black': '#2e2a28',
  'reddish-black': '#2c1a1a', 'blueish-black': '#1c2230', 'purpleish-black': '#24192b',
  'deep-black': '#0f0e0e', 'dark-gray': '#5b5b5e', 'light-gray': '#a8a8ac',
  'pink': '#f08fb7', 'magenta': '#c2299b', 'purple': '#7a3fc4',
  'blue': '#2f5fd0', 'light-blue': '#6fb7f0', 'cyan': '#1fb8c4',
  'green': '#2e9e44', 'lime-green': '#8bd43a', 'yellow': '#f2d21b',
  'orange': '#f28a1b', 'red': '#d02a22'
};

export const EYEHEX = {
  amber: '#c68a1c', black: '#1a1a1a', blue: '#3a6fd0', brown: '#6a4125',
  cyan: '#25b5c5', gray: '#8a8f96', grayblue: '#6c85a0', green: '#3f9b4f',
  'light-blue': '#86c4ee', 'light-gray': '#c0c4c8', 'lime-green': '#92d13a',
  magenta: '#c2299b', orange: '#ee8a1f', pink: '#f08fb7', purple: '#7a3fc4',
  red: '#cc2a24', vivid: '#35e0a0', white: '#f4f4f4', yellow: '#f0d020',
  'yellow-green': '#b7d334'
};

// Skin tones a villager can have (tint on the grayscale skin layer). Index 0 is "Natural": it reproduces villager.png as is,
// and it is what villagers get when no tone is set. The others are gentle steps lighter and darker. Edit freely; keep index 0 first.
// Unlike hair/eye/outfit colors, the skin tone does not shift with profession/biome: you get exactly the tone you pick.
export const SKIN_TONES = [
  { name: 'Natural', hex: '#c08469' },
  { name: 'Pale', hex: '#e1ba9f' },
  { name: 'Fair', hex: '#d5a68b' },
  { name: 'Light', hex: '#cb957b' },
  { name: 'Tan', hex: '#a5715a' },
  { name: 'Brown', hex: '#8a5f4b' },
  { name: 'Deep', hex: '#6f4c3d' },
  { name: 'Dark', hex: '#563b2f' }
];

// Nose styles: each one is its own geometry (geometry.villager_nose_<style>), picked in game by a geometry array.
export const NOSE_STYLES = ['default', 'button', 'big', 'witch', 'pointy'];
export const NOSE_COUNT = NOSE_STYLES.length;
export const noseGeoName = s => `geometry.villager_nose_${s}`;

export const SKINS = ['#f6d2b0', '#eebb92', '#d9a077', '#b87d57', '#8a5a3b', '#5d3b27'];

// Eye styles: 34 colors per style (1..34 = default, 35..68 = wide, etc.)
export const EYE_COLORS = 34;
export const EYE_STYLES = ['default', 'wide', 'dots', 'blush'];
export const EYE_MAX = EYE_STYLES.length * EYE_COLORS; // 68
export const eyeStart = s => {
  const k = EYE_STYLES.indexOf(s);
  return k < 0 ? 1 : k * EYE_COLORS + 1;
};
export const eyeStyle = e => EYE_STYLES[Math.floor((clamp(e, 1, EYE_MAX) - 1) / EYE_COLORS)] || 'default';
export const eyeColor = e => ((clamp(e, 1, EYE_MAX) - 1) % EYE_COLORS) + 1;
export const eyeIndex = (s, c) => eyeStart(s) + clamp(c - 1, 0, EYE_COLORS - 1);
export const eyeRange = s => {
  const st = eyeStart(s);
  return [st, st + EYE_COLORS - 1];
};

const shade = (hex, f) =>
  '#' + [1, 3, 5].map(i => {
    let v = parseInt(hex.substr(i, 2), 16);
    v = f < 0 ? v * (1 + f) : v + (255 - v) * f;
    return Math.round(v).toString(16).padStart(2, '0');
  }).join('');

const leaf = p => (p || '').split('/').pop();

export function createLookups(M) {
  const eyeName = i => leaf(M.eyes[eyeColor(i)]).replace('eyes_', '');
  const eyeHex = i => {
    const n = eyeName(i);
    if (EYEHEX[n]) return EYEHEX[n];
    const m = n.match(/^(.+?)-(dark|darksoft|light|mid|verydark|bright|cooldark|warmdark)$/);
    if (!m) return EYEHEX[n.split('-')[0]] || '#888';
    const b = EYEHEX[m[1]] || '#888', s = m[2];
    return /verydark/.test(s) ? shade(b, -0.55) : /dark/.test(s) ? shade(b, -0.3) : /light|bright/.test(s) ? shade(b, 0.3) : b;
  };
  const hairName = i => (hairStyle(i) == 'bald' ? '' : M.colors[clamp(hairColor(i), 1, 35) - 1] || '');
  const hairHex = i => (hairStyle(i) == 'bald' ? '#999' : HEX[hairName(i)] || '#888');
  return { eyeName, eyeHex, hairName, hairHex };
}

// Hair styles. 0 = bald, 1-35 ari, 36-70 alex, 72-99 = bald (legacy), then 35 colors per extra style from 100.
export const HAIR_NEW_START = 100;
export const HAIR_STYLES = ['ari', 'alex', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri'];
export const HAIR_MAX = HAIR_NEW_START + (HAIR_STYLES.length - 2) * 35 - 1; // 344
export const hairStart = s => {
  const k = HAIR_STYLES.indexOf(s);
  return k < 0 ? -1 : k == 0 ? 1 : k == 1 ? 36 : HAIR_NEW_START + (k - 2) * 35;
};
export const hairStyle = h => {
  if (!h || h < 1) return 'bald';
  if (h <= 35) return 'ari';
  if (h <= 71) return 'alex';
  if (h < HAIR_NEW_START) return 'bald';
  return HAIR_STYLES[Math.floor((h - HAIR_NEW_START) / 35) + 2] || 'bald';
};
export const hairColor = h => { const s = hairStyle(h); return s == 'bald' ? 0 : h - hairStart(s) + 1; };
export const hairIndex = (s, c) => s == 'bald' ? 72 : hairStart(s) + clamp(c - 1, 0, 34);
export const hairRange = s => s == 'bald' ? [0, -1] : [hairStart(s), hairStart(s) + 34];
export const heightScale = t => 0.88 + (0.22 * (t - 1)) / 33;

export const CROSS_STYLE = 1000;

export function hairToSheet(h, k, special) {
  const s = hairStyle(h);
  if (s == 'bald') return 72;
  if (special || h >= HAIR_NEW_START) return h;
  return s == (k === 'f' ? 'alex' : 'ari') ? h : h + CROSS_STYLE;
}

export function hairFromSheet(h, female, special) {
  if (h == null) return 72;
  const fh = x => ((x - 1) % 35) + 1;
  if (h > CROSS_STYLE) return clamp(h - CROSS_STYLE, 1, 70);
  if (h >= HAIR_NEW_START) return clamp(h, HAIR_NEW_START, HAIR_MAX);
  if (h === 72) return 72;
  if (h > 72 && h < HAIR_NEW_START) {
    return HAIR_NEW_START + (h - 73);
  }
  if (special) {
    const s = Math.floor((h - 1) / 35), c = fh(h);
    return s == 0 ? c : s == 1 ? 35 + c : 72;
  }
  return clamp(h, 1, 70);
}

export function parseCSV(t) {
  const rows = [];
  let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch == '"') {
        if (t[i + 1] == '"') { c += '"'; i++; }
        else q = false;
      } else c += ch;
    } else if (ch == '"') q = true;
    else if (ch == ',') { r.push(c); c = ''; }
    else if (ch == '\n' || ch == '\r') {
      if (ch == '\r' && t[i + 1] == '\n') i++;
      r.push(c); rows.push(r); r = []; c = '';
    } else c += ch;
  }
  if (c || r.length) { r.push(c); rows.push(r); }
  return rows;
}

export function sheetToRecords(text) {
  const rows = parseCSV(text).slice(1);
  const out = {};
  const N = s => String(s).replace(/\*/g, '').trim();
  const num = (r, i) => { const v = parseInt(r[i]); return isNaN(v) ? null : v; };
  const has = (r, i) => r[i] && r[i].trim() !== '';
  const outCell = (r, i, derived) => { const v = num(r, i); return v != null && v >= 1 && v <= 34 ? v : derived; };

  const autoSk = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return Math.abs(hash) % SKIN_TONES.length;
  };

  rows.forEach(r => {
    if (has(r, 0)) {
      const n = N(r[0]);
      out[n] = { e: clamp(num(r, 1), 1, EYE_MAX), h: hairFromSheet(num(r, 2), false, false), o: clamp(num(r, 4), 1, 34), t: clamp(num(r, 3), 1, 34), k: 'm', sk: autoSk(n) };
    }
  });
  rows.forEach((r, idx) => {
    if (has(r, 5)) {
      const n = N(r[5]);
      out[n] = { e: clamp(num(r, 6), 1, EYE_MAX), h: hairFromSheet(num(r, 7), true, false), t: clamp(num(r, 8), 1, 34), o: outCell(r, 9, ((eyeColor(num(r, 6)) + num(r, 8) + idx) % 34) + 1), k: 'f', sk: autoSk(n) };
    }
  });
  rows.forEach((r, idx) => {
    if (has(r, 10)) {
      const n = N(r[10]);
      out[n] = { e: clamp(num(r, 11), 1, EYE_MAX), h: hairFromSheet(num(r, 12), false, true), t: clamp(num(r, 13), 1, 34), o: outCell(r, 14, ((eyeColor(num(r, 11)) + num(r, 13) + idx) % 34) + 1), k: 'm', s: 1, sk: autoSk(n) };
    }
  });
  rows.forEach(r => {
    if (has(r, 15)) {
      const n = N(r[15]);
      out[n] = { e: clamp(num(r, 16), 1, EYE_MAX), h: hairFromSheet(num(r, 17), true, true), t: clamp(num(r, 18), 1, 34), o: clamp(num(r, 19), 1, 34), k: 'f', s: 1, sk: autoSk(n) };
    }
  });
  return out;
}

export function shiftOffsets(profIndex, skinId, biomeIndex) {
  const prof = clamp(profIndex, 0, 14);
  const skin = clamp(skinId, 0, 5);
  const biome = clamp(biomeIndex, 0, 6);

  const comboSeed = (prof * 42) + (biome * 6) + skin;
  const outfitShift = (comboSeed * 7) + (skin * 3);
  const eyeShift = (comboSeed * 13) + (skin * 11);
  const hairShift = (comboSeed * 19) + (skin * 17);
  const heightShift = (comboSeed * 23) + (skin * 5);
  const styleShift = (comboSeed * 5) + skin;
  const eyeStyleShift = (comboSeed * 3) + skin;
  const noseShift = (comboSeed * 29) + (skin * 7);
  const defaultSeed = Math.abs((skin * 37) + (prof * 17) + (biome * 13));

  const unnamedO = (((defaultSeed * 7) + outfitShift) % 34) + 1;
  const unnamedE = ((defaultSeed + eyeShift) % 34) + 1;
  const unnamedC = (((defaultSeed * 11) + hairShift) % 35) + 1;
  const unnamedT = (((defaultSeed * 23) + heightShift) % 34) + 1;
  const unnamedStyleIdx = (defaultSeed + styleShift) % HAIR_STYLES.length;
  const unnamedEyeStyleIdx = (defaultSeed + eyeStyleShift) % EYE_STYLES.length;
  const unnamedNoseIdx = (defaultSeed + noseShift) % NOSE_COUNT;

  return { prof, skin, biome, unnamedO, unnamedE, unnamedC, unnamedT, unnamedStyleIdx, unnamedEyeStyleIdx, unnamedNoseIdx };
}

export function computeInGameLook(villagerName, record, profIndex, skinId, biomeIndex, simShift) {
  const { prof, skin, biome, unnamedO, unnamedE, unnamedC, unnamedT, unnamedStyleIdx, unnamedEyeStyleIdx, unnamedNoseIdx } =
    shiftOffsets(profIndex, skinId, biomeIndex);
  const unnamedH = hairIndex(HAIR_STYLES[unnamedStyleIdx], unnamedC);
  const unnamedEFull = eyeIndex(EYE_STYLES[unnamedEyeStyleIdx], unnamedE);

  if (!villagerName || !villagerName.trim()) {
    return {
      e: unnamedEFull,
      o: unnamedO,
      h: unnamedH,
      t: unnamedT,
      n: unnamedNoseIdx,
      sk: 0,
      mode: `Unnamed Combo (Skin ${skin} · Prof ${prof} · Biome ${biome})`
    };
  }
  if (record.s) {
    return {
      e: record.e,
      o: record.o,
      h: record.h,
      t: record.t,
      n: record.n | 0,
      sk: record.sk | 0,
      mode: '★ Special Locked (Exact colors across all jobs/biomes/skins)'
    };
  }
  if (!simShift) {
    return {
      e: record.e,
      o: record.o,
      h: record.h,
      t: record.t,
      n: record.n | 0,
      sk: record.sk | 0,
      mode: 'Base CSV values (Shift preview off)'
    };
  }

  const baseEyeStyleIdx = Math.max(0, EYE_STYLES.indexOf(eyeStyle(record.e)));
  const shiftedEyeStyleIdx = (baseEyeStyleIdx + unnamedEyeStyleIdx) % EYE_STYLES.length;
  const shiftedEyeColor = (((eyeColor(record.e) - 1) + (unnamedE - 1)) % 34) + 1;
  const eShifted = eyeIndex(EYE_STYLES[shiftedEyeStyleIdx], shiftedEyeColor);

  const oShifted = (((record.o - 1) + (unnamedO - 1)) % 34) + 1;
  const tShifted = (((record.t - 1) + (unnamedT - 1)) % 34) + 1;

  let hShifted = 72;
  const hs = hairStyle(record.h);
  if (hs !== 'bald') {
    const baseStyleIdx = HAIR_STYLES.indexOf(hs);
    const shiftedStyleIdx = (baseStyleIdx + unnamedStyleIdx) % HAIR_STYLES.length;
    const shiftedColor = (((hairColor(record.h) - 1) + (unnamedC - 1)) % 35) + 1;
    hShifted = hairIndex(HAIR_STYLES[shiftedStyleIdx], shiftedColor);
  }

  return {
    e: eShifted,
    o: oShifted,
    h: hShifted,
    t: tShifted,
    n: ((record.n | 0) + unnamedNoseIdx) % NOSE_COUNT,
    sk: record.sk | 0,
    mode: `Shifted (Skin ${skin} + Prof ${prof} + Biome ${biome} + Name)`
  };
}

const DATA_FILES = {
  manifest: 'data/manifest.json',
  geometry: 'data/villager.geo.json',
  noseGeometry: 'data/villager-nose.geo.json',
  villagers: 'data/villagers.csv'
};

async function fetchData(url, parse) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response[parse]();
}

export async function loadAppData() {
  const [M, GEO, noseGeo, csv] = await Promise.all([
    fetchData(DATA_FILES.manifest, 'json'),
    fetchData(DATA_FILES.geometry, 'json'),
    fetchData(DATA_FILES.noseGeometry, 'json'),
    fetchData(DATA_FILES.villagers, 'text')
  ]);

  const missing = NOSE_STYLES.map(noseGeoName).filter(name => !noseGeo[name]);
  if (missing.length) throw new Error(`${DATA_FILES.noseGeometry} is missing: ${missing.join(', ')}`);
  Object.assign(GEO, noseGeo);

  const base = sheetToRecords(csv);
  const KEY = 'villagerMaker.overrides.v1';
  let over = {};
  try {
    over = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k of Object.keys(over)) {
      if (k.includes(',')) delete over[k];
    }
  } catch {}

  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(over)); } catch {}
  };

  return { M, GEO, base, over, persist };
}