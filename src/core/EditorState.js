import {
  eyeStyle,
  eyeColor,
  eyeIndex,
  hairStyle,
  hairColor,
  hairIndex,
  EYE_STYLES,
  HAIR_STYLES,
  NOSE_STYLES,
  shiftOffsets
} from '../data.js';

/** @typedef {'m' | 'f'} Gender */

/**
 * @typedef {Object} VillagerRecord
 * @property {number} e   Eye index
 * @property {number} h   Hair index
 * @property {number} o   Outfit color (1–34)
 * @property {number} t   Height (1–34)
 * @property {Gender} k   Gender
 * @property {number} [s] Special lock flag (1 when present)
 * @property {number} [n] Nose style index
 * @property {number} sk  Skin tone index
 */

/**
 * @typedef {Object} PreviewConfig
 * @property {number} prof
 * @property {number} biome
 * @property {number} tier
 * @property {number} skin
 */

const COLOR_MODULO = 34;
const HAIR_COLOR_MODULO = 35;
const BALD_HAIR_INDEX = 72;

/**
 * Inverse modular shift: maps a displayed value back to the base CSV value.
 * The large positive bias keeps the result non-negative before the final modulo.
 */
function invertShift(displayed, offset, modulo) {
  return (((displayed - 1) - (offset - 1) + modulo * 10) % modulo) + 1;
}

function invertIndex(displayed, offset, count) {
  return (displayed - offset + count * 10) % count;
}

/**
 * Holds the editable villager state, preview settings, and persistence.
 * Responsible for dirty checking, inverse-shift patching, and save/load of overrides.
 */
export class EditorState {
  /**
   * @param {Record<string, VillagerRecord>} baseData
   * @param {Record<string, VillagerRecord>} overrides
   * @param {() => void} persistCallback
   */
  constructor(baseData, overrides, persistCallback) {
    this.baseData = baseData;
    this.overrides = overrides;
    this.persistCallback = persistCallback;

    /** @type {VillagerRecord & { name: string }} */
    this.current = {
      name: '',
      e: 1,
      h: 1,
      o: 1,
      t: 17,
      k: 'm',
      s: 0,
      n: 0,
      sk: 0
    };

    /** @type {VillagerRecord | null} */
    this.saved = null;

    /** @type {PreviewConfig} */
    this.previewConfig = {
      prof: 5,
      biome: 0,
      tier: 0,
      skin: 0
    };

    this.filter = 'all';
    this.isShiftSimulated = true;
  }

  /**
   * Returns the effective record for a name (override layered on base).
   * @param {string} name
   * @returns {VillagerRecord | undefined}
   */
  lookup(name) {
    if (this.overrides[name]) {
      return { ...this.baseData[name], ...this.overrides[name] };
    }
    return this.baseData[name];
  }

  /**
   * True when the current working state differs from the last saved snapshot.
   */
  isDirty() {
    const a = this.current;
    const b = this.saved;

    if (!a || !b) return true;

    return (
      a.e !== b.e ||
      a.h !== b.h ||
      a.o !== b.o ||
      a.t !== b.t ||
      a.k !== b.k ||
      Boolean(a.s) !== Boolean(b.s) ||
      (a.n | 0) !== (b.n | 0) ||
      (a.sk | 0) !== (b.sk | 0)
    );
  }

  /**
   * Builds the compact record that is stored in overrides / CSV export.
   * Omits default-zero fields where the original format expects absence.
   * @returns {VillagerRecord}
   */
  getRecord() {
    const { e, h, o, t, k, s, n, sk } = this.current;

    return {
      e,
      h,
      o,
      t,
      k,
      ...(s ? { s: 1 } : {}),
      ...(n ? { n } : {}),
      sk: sk | 0
    };
  }

  /**
   * Whether the profession/biome/skin shift should be applied for the current villager.
   */
  isShiftingActive() {
    return Boolean(
      this.current.name?.trim() &&
      !this.current.s &&
      this.isShiftSimulated
    );
  }

  /**
   * Applies a partial update coming from the UI.
   * When shifting is active the values are inverse-mapped so the stored base
   * values remain correct for the CSV / Bedrock export.
   * @param {Partial<VillagerRecord>} patch
   */
  applyPreviewPatch(patch) {
    if (!this.isShiftingActive()) {
      Object.assign(this.current, patch);
      return;
    }

    const {
      unnamedO,
      unnamedE,
      unnamedC,
      unnamedT,
      unnamedStyleIdx,
      unnamedEyeStyleIdx,
      unnamedNoseIdx
    } = shiftOffsets(
      this.previewConfig.prof,
      this.previewConfig.skin,
      this.previewConfig.biome
    );

    if (patch.o != null) {
      this.current.o = invertShift(patch.o, unnamedO, COLOR_MODULO);
    }

    if (patch.t != null) {
      this.current.t = invertShift(patch.t, unnamedT, COLOR_MODULO);
    }

    if (patch.n != null) {
      this.current.n = invertIndex(patch.n, unnamedNoseIdx, NOSE_STYLES.length);
    }

    if (patch.e != null) {
      const targetStyle = eyeStyle(patch.e);
      const targetColor = eyeColor(patch.e);
      const targetStyleIdx = Math.max(0, EYE_STYLES.indexOf(targetStyle));
      const baseStyleIdx = invertIndex(targetStyleIdx, unnamedEyeStyleIdx, EYE_STYLES.length);
      const baseColor = invertShift(targetColor, unnamedE, COLOR_MODULO);
      this.current.e = eyeIndex(EYE_STYLES[baseStyleIdx], baseColor);
    }

    if (patch.h != null) {
      const targetStyle = hairStyle(patch.h);

      if (targetStyle === 'bald') {
        this.current.h = BALD_HAIR_INDEX;
      } else {
        const targetColor = hairColor(patch.h) || 16;
        const targetStyleIdx = Math.max(0, HAIR_STYLES.indexOf(targetStyle));
        const baseStyleIdx = invertIndex(targetStyleIdx, unnamedStyleIdx, HAIR_STYLES.length);
        const baseColor = invertShift(targetColor, unnamedC, HAIR_COLOR_MODULO);
        this.current.h = hairIndex(HAIR_STYLES[baseStyleIdx], baseColor);
      }
    }
  }

  /**
   * Persists the current villager.
   * Removes the override entry when the record matches the original base data.
   */
  saveCurrent() {
    this.current.name = this.current.name.trim();
    const record = this.getRecord();
    const name = this.current.name;

    const base = this.baseData[name];
    const isIdenticalToBase =
      base && JSON.stringify(base) === JSON.stringify(record);

    if (isIdenticalToBase) {
      delete this.overrides[name];
    } else {
      this.overrides[name] = record;
    }

    this.persistCallback();
    this.saved = record;
  }
}