import { eyeStyle, hairStyle, NOSE_STYLES, SKIN_TONES, BALD_HAIR_INDEX } from '../data.js';
import { BIOME_NAMES } from '../tint.js';
import { markSwatchSelection, markTextureSelection } from './GridBuilder.js';
import { formatIdentifier } from './format.js';

const withBase = (shown, base, changed) => (changed ? `${shown} (${base})` : shown);

function chipText({ name, exists, dirty, edited }) {
  if (!name) return 'Unnamed Preview';
  if (!exists) return dirty ? 'New · unsaved' : 'New';
  if (dirty) return 'Unsaved changes';
  return edited ? 'Edited' : 'From sheet';
}

function resetText({ edited, hasBase }) {
  if (!edited) return 'Reset';
  return hasBase ? 'Reset to sheet' : 'Delete';
}

export class EditorSync {
  constructor({ elements, manifest, lookups, grids }) {
    this.elements = elements;
    this.manifest = manifest;
    this.lookups = lookups;
    this.grids = grids;
  }

  sync(state, simulation, appData) {
    const { current } = state;

    this.grids.syncStyleColors(simulation);
    this.syncBody(current, simulation);
    this.syncEyes(current, simulation);
    this.syncHair(current, simulation);
    this.syncNose(current, simulation);
    this.syncOutfit(current, simulation);
    this.syncSkinTone(simulation);
    this.syncPreviewConfig(state.previewConfig);
    this.syncDirtyStatus(state, appData);
  }

  syncBody(current, simulation) {
    const { typeLabel, genderSegment, specialBtn, heightLabel, heightSlider } = this.elements;

    typeLabel.textContent = current.s ? '★ Locked Special' : 'Shifts by 6 × Prof';
    genderSegment.querySelectorAll('button[data-k]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.k === current.k));
    });
    specialBtn.setAttribute('aria-pressed', String(!!current.s));

    heightLabel.textContent = withBase(
      simulation.t,
      `Base ${current.t}`,
      simulation.t !== current.t
    );
    heightSlider.value = simulation.t;
  }

  syncEyes(current, simulation) {
    const { eyesLabel, eyesSegment, eyesGrid } = this.elements;
    const { eyeName } = this.lookups;
    const shownStyle = eyeStyle(simulation.e);

    const shown = `${simulation.e} · ${shownStyle} ${eyeName(simulation.e)}`;
    const base = `Base ${current.e} · ${eyeStyle(current.e)} ${eyeName(current.e)}`;
    eyesLabel.textContent = withBase(shown, base, simulation.e !== current.e);

    markTextureSelection(eyesSegment, shownStyle, 's');
    markSwatchSelection(eyesGrid, simulation.e);
  }

  syncHair(current, simulation) {
    const { hairLabel, hairSegment, hairGrid } = this.elements;
    const { hairName } = this.lookups;
    const shownStyle = hairStyle(simulation.h);
    const baseStyle = hairStyle(current.h);
    const bald = `bald (${BALD_HAIR_INDEX})`;

    const shown = shownStyle === 'bald'
      ? bald
      : `${simulation.h} · ${shownStyle} ${hairName(simulation.h)}`;
    const base = baseStyle === 'bald'
      ? bald
      : `Base ${current.h} · ${baseStyle} ${hairName(current.h)}`;
    hairLabel.textContent = withBase(shown, base, simulation.h !== current.h);

    markTextureSelection(hairSegment, shownStyle, 's');
    markSwatchSelection(hairGrid, simulation.h);
  }

  syncNose(current, simulation) {
    const { noseLabel, noseSegment } = this.elements;
    const shownIndex = simulation.n | 0;
    const baseIndex = current.n | 0;

    noseLabel.textContent = withBase(
      NOSE_STYLES[shownIndex],
      `Base ${NOSE_STYLES[baseIndex]}`,
      shownIndex !== baseIndex
    );
    markTextureSelection(noseSegment, shownIndex, 'v');
  }

  syncOutfit(current, simulation) {
    const { outfitLabel, outfitGrid } = this.elements;
    const { colors } = this.manifest;

    const shown = `${simulation.o} · ${colors[simulation.o - 1]}`;
    const base = `Base ${current.o} · ${colors[current.o - 1]}`;
    outfitLabel.textContent = withBase(shown, base, simulation.o !== current.o);
    markSwatchSelection(outfitGrid, simulation.o);
  }

  syncSkinTone(simulation) {
    const { skinToneLabel, skinToneGrid } = this.elements;
    const index = simulation.sk | 0;

    skinToneLabel.textContent = SKIN_TONES[index]?.name || '';
    markSwatchSelection(skinToneGrid, index);
  }

  syncPreviewConfig({ prof, biome, skin, tier }) {
    const { profGrid, biomeGrid, skinGrid, profLabel, biomeLabel, skinLabel, tierSelect } = this.elements;
    const profession = this.manifest.professions[prof];

    markTextureSelection(profGrid, prof, 'v');
    markTextureSelection(biomeGrid, biome, 'v');
    markTextureSelection(skinGrid, skin, 'v');

    profLabel.textContent = `${prof} · ${profession ? formatIdentifier(profession.id) : ''}`;
    biomeLabel.textContent = `${biome} · ${formatIdentifier(BIOME_NAMES[biome] || '')}`;
    skinLabel.textContent = `ID ${skin}`;
    tierSelect.value = tier;
  }

  syncDirtyStatus(state, appData) {
    const { chip, resetLabel } = this.elements;
    const { name } = state.current;
    const edited = !!appData.over[name];
    const dirty = state.isDirty();

    chip.className = dirty ? 'unsaved' : '';
    chip.textContent = chipText({ name, exists: !!state.lookup(name), dirty, edited });
    resetLabel.textContent = resetText({ edited, hasBase: !!appData.base[name] });
  }
}