import { 
  eyeStyle, eyeColor, eyeIndex, 
  hairStyle, hairColor, hairIndex, 
  EYE_STYLES, HAIR_STYLES, NOSE_STYLES, shiftOffsets 
} from '../data.js';

export class EditorState {
  constructor(baseData, overrides, persistCallback) {
    this.baseData = baseData;
    this.overrides = overrides;
    this.persistCallback = persistCallback;

    /** 
     * Villager Configuration Schema:
     * @property {string} name - Entity Name
     * @property {number} e - Eye index
     * @property {number} h - Hair index
     * @property {number} o - Outfit color index (1-34)
     * @property {number} t - Height/Tallness index (1-34)
     * @property {string} k - Gender ('m' or 'f')
     * @property {number} s - Special lock flag (0 or 1)
     * @property {number} n - Nose style index
     * @property {number} sk - Skin tone index
     */
    this.current = { name: '', e: 1, h: 1, o: 1, t: 17, k: 'm', s: 0, n: 0, sk: 0 };
    this.saved = null;
    
    this.previewConfig = { prof: 5, biome: 0, tier: 0, skin: 0 };
    this.filter = 'all';
    this.isShiftSimulated = true;
  }

  lookup(name) {
    return this.overrides[name] ? { ...this.baseData[name], ...this.overrides[name] } : this.baseData[name];
  }

  isDirty() {
    const a = this.current;
    const b = this.saved;
    if (!a || !b) return true;
    
    return a.e !== b.e || a.h !== b.h || a.o !== b.o || 
           a.t !== b.t || a.k !== b.k || (!!a.s) !== (!!b.s) || 
           (a.n | 0) !== (b.n | 0) || (a.sk | 0) !== (b.sk | 0);
  }

  getRecord() {
    return {
      e: this.current.e,
      h: this.current.h,
      o: this.current.o,
      t: this.current.t,
      k: this.current.k,
      ...(this.current.s ? { s: 1 } : {}),
      ...(this.current.n ? { n: this.current.n } : {}),
      sk: this.current.sk | 0
    };
  }

  isShiftingActive() {
    return !!(this.current.name && this.current.name.trim() && !this.current.s && this.isShiftSimulated);
  }

  /**
   * Converts a user-selected on-screen visual value back into the base CSV value,
   * accounting for the active modulo shift.
   */
  applyPreviewPatch(patch) {
    if (!this.isShiftingActive()) {
      Object.assign(this.current, patch);
      return;
    }

    const offsets = shiftOffsets(this.previewConfig.prof, this.previewConfig.skin, this.previewConfig.biome);
    const { unnamedO, unnamedE, unnamedC, unnamedT, unnamedStyleIdx, unnamedEyeStyleIdx, unnamedNoseIdx } = offsets;

    if (patch.o != null) {
      this.current.o = (((patch.o - 1) - (unnamedO - 1) + 340) % 34) + 1;
    }
    if (patch.n != null) {
      const noseCount = NOSE_STYLES.length;
      this.current.n = (patch.n - unnamedNoseIdx + noseCount * 10) % noseCount;
    }
    if (patch.t != null) {
      this.current.t = (((patch.t - 1) - (unnamedT - 1) + 340) % 34) + 1;
    }
    if (patch.e != null) {
      const targetStyle = eyeStyle(patch.e);
      const targetColor = eyeColor(patch.e);
      const targetStyleIdx = Math.max(0, EYE_STYLES.indexOf(targetStyle));
      const baseStyleIdx = (targetStyleIdx - unnamedEyeStyleIdx + EYE_STYLES.length * 10) % EYE_STYLES.length;
      const baseColor = (((targetColor - 1) - (unnamedE - 1) + 340) % 34) + 1;
      this.current.e = eyeIndex(EYE_STYLES[baseStyleIdx], baseColor);
    }
    if (patch.h != null) {
      const targetStyle = hairStyle(patch.h);
      if (targetStyle === 'bald') {
        this.current.h = 72;
      } else {
        const targetColor = hairColor(patch.h) || 16;
        const targetStyleIdx = Math.max(0, HAIR_STYLES.indexOf(targetStyle));
        const baseStyleIdx = (targetStyleIdx - unnamedStyleIdx + HAIR_STYLES.length * 10) % HAIR_STYLES.length;
        const baseColor = (((targetColor - 1) - (unnamedC - 1) + 350) % 35) + 1;
        this.current.h = hairIndex(HAIR_STYLES[baseStyleIdx], baseColor);
      }
    }
  }

  saveCurrent() {
    this.current.name = this.current.name.trim();
    const record = this.getRecord();
    
    if (this.baseData[this.current.name] && JSON.stringify(this.baseData[this.current.name]) === JSON.stringify(record)) {
      delete this.overrides[this.current.name];
    } else {
      this.overrides[this.current.name] = record;
    }
    
    this.persistCallback();
    this.saved = record;
  }
}