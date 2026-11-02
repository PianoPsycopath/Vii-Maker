import {
  clamp, sheetToRecords, EYE_MAX, HAIR_MAX, COLOR_COUNT, NOSE_STYLES, SKIN_TONES
} from '../data.js';

export async function readVillagerRecords(file) {
  const text = await file.text();
  return file.name.endsWith('.csv') ? sheetToRecords(text) : JSON.parse(text);
}

function normalizeRecord(rec) {
  return {
    e: clamp(rec.e, 1, EYE_MAX),
    h: clamp(rec.h, 0, HAIR_MAX),
    o: clamp(rec.o, 1, COLOR_COUNT),
    t: clamp(rec.t, 1, COLOR_COUNT),
    k: rec.k || 'm',
    ...(rec.s ? { s: 1 } : {}),
    ...(rec.n ? { n: clamp(rec.n, 0, NOSE_STYLES.length - 1) } : {}),
    ...(rec.sk !== undefined ? { sk: clamp(rec.sk, 0, SKIN_TONES.length - 1) } : {})
  };
}

export function mergeImportedRecords(records, { base, over }) {
  let imported = 0;

  for (const [name, rec] of Object.entries(records)) {
    if (!rec || typeof rec.e !== 'number') continue;

    const record = normalizeRecord(rec);
    if (base[name] && JSON.stringify(base[name]) === JSON.stringify(record)) {
      delete over[name];
    } else {
      over[name] = record;
    }
    imported++;
  }
  return imported;
}