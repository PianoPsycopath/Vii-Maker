import {
  HEX, SKINS, eyeStyle, eyeRange, EYE_STYLES,
  hairStyle, hairRange, HAIR_STYLES, NOSE_STYLES, SKIN_TONES,
  COLOR_COUNT, BALD_HAIR_INDEX
} from '../data.js';
import { BIOME_NAMES } from '../tint.js';
import { playSelect, playTab, playToggle, playRandom, playSave, playVillagerAccept } from '../sound.js';
import { fitTabIcons } from '../utils/iconFitter.js';
import {
  bindHoverSounds, buildSwatchGrid, buildTextureGrid,
  markSwatchSelection, markTextureSelection, applyGridThumbnails
} from './GridBuilder.js';

const TAB_FOCUS_MAP = {
  'tab-plaza': 'full',
  'tab-id': 'body',
  'tab-face': 'face',
  'tab-hair': 'hair',
  'tab-brows': 'brows',
  'tab-eyes': 'eyes',
  'tab-nose': 'nose',
  'tab-mouth': 'mouth',
  'tab-glasses': 'glasses',
  'tab-outfit': 'outfit',
  'tab-export': 'full'
};

const ELEMENT_SELECTORS = {
  introScreen: '#introScreen',
  paradeBtn: '#paradeBtn',
  musicBtn: '#musicBtn',
  soundBtn: '#soundBtn',
  stage: '#stage',
  canvas: '#cv',
  spinCheckbox: '#spin',
  simShiftCheckbox: '#simShift',
  shiftInfo: '#shiftInfo',
  status: '#status',
  nameInput: '#name',
  chip: '#chip',
  saveBtn: '#save',
  viewPlazaBtn: '#viewPlaza',
  searchInput: '#q',
  countLabel: '#count',
  listContainer: '#list',
  typeLabel: '#typeL',
  genderSegment: '#genderS',
  specialBtn: '#specBtn',
  heightLabel: '#htL',
  heightSlider: '#ht',
  skinToneLabel: '#skinToneL',
  skinToneGrid: '#skinToneG',
  noseLabel: '#noseL',
  noseSegment: '#noseS',
  eyesLabel: '#eyesL',
  eyesSegment: '#eyesS',
  eyesGrid: '#eyesG',
  hairLabel: '#hairL',
  hairSegment: '#hairS',
  hairGrid: '#hairG',
  outfitLabel: '#outL',
  outfitGrid: '#outG',
  profLabel: '#profL',
  profGrid: '#profG',
  biomeLabel: '#biomeL',
  biomeGrid: '#biomeG',
  skinLabel: '#skinL',
  skinGrid: '#skinG',
  tierSelect: '#tier',
  resetBtn: '#reset',
  randomBtn: '#rand',
  exportRPBtn: '#expRP',
  exportCSVBtn: '#expCSV',
  exportEditsBtn: '#exp',
  exportAllBtn: '#expAll',
  importBtn: '#imp',
  fileInput: '#file'
};

// The intro overlay is removed after first click and is null-guarded; every other element is required.
const OPTIONAL_ELEMENTS = new Set(['introScreen']);

const formatIdentifier = str => str.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const capitalize = str => str[0].toUpperCase() + str.slice(1);
const formatHairStyle = str => (str === 'bald' ? 'Bald' : capitalize(str));

export class UIController {
  constructor({ manifest, lookups, callbacks }) {
    this.manifest = manifest;
    this.lookups = lookups;
    this.callbacks = callbacks;

    this.activeTab = 'tab-plaza';
    this.lastHairStyle = null;
    this.lastEyeStyle = null;

    this.elements = this.queryElements();
  }

  queryElements() {
    const elements = { body: document.body };
    const missing = [];

    for (const [key, selector] of Object.entries(ELEMENT_SELECTORS)) {
      const element = document.querySelector(selector);
      elements[key] = element;
      if (!element && !OPTIONAL_ELEMENTS.has(key)) missing.push(selector);
    }

    if (missing.length) {
      throw new Error(`UIController: missing required DOM elements: ${missing.join(', ')}`);
    }
    return elements;
  }

  initialize() {
    fitTabIcons();
    this.buildStaticGrids();
    this.bindEvents();
    bindHoverSounds(this.elements.body);
  }

  buildStaticGrids() {
    const { elements, manifest, callbacks } = this;

    buildTextureGrid(
      elements.eyesSegment,
      EYE_STYLES.map(style => ({
        val: style,
        s: style,
        label: capitalize(style),
        title: `Eye Style: ${capitalize(style)}`
      })),
      style => callbacks.onSelectEyeStyle(style)
    );

    buildTextureGrid(
      elements.hairSegment,
      ['bald', ...HAIR_STYLES].map(style => ({
        val: style,
        s: style,
        label: formatHairStyle(style),
        title: `Hair Style: ${formatHairStyle(style)}`
      })),
      style => callbacks.onSelectHairStyle(style)
    );

    buildTextureGrid(
      elements.noseSegment,
      NOSE_STYLES.map((style, index) => ({
        val: index,
        s: style,
        label: capitalize(style),
        title: `Nose Style: ${capitalize(style)}`
      })),
      index => callbacks.onPatchLook({ n: index })
    );

    buildSwatchGrid(
      elements.outfitGrid,
      Array.from({ length: COLOR_COUNT }, (_, index) => ({
        val: index + 1,
        hex: HEX[manifest.colors[index]],
        title: `${index + 1} ${manifest.colors[index]}`
      })),
      val => callbacks.onPatchLook({ o: val })
    );

    buildSwatchGrid(
      elements.skinToneGrid,
      SKIN_TONES.map((tone, index) => ({
        val: index,
        hex: tone.hex,
        title: `${index} ${tone.name}`
      })),
      val => callbacks.onSelectSkinTone(val)
    );

    buildTextureGrid(
      elements.profGrid,
      manifest.professions.map((prof, index) => ({
        val: index,
        label: formatIdentifier(prof.id),
        title: `${index}: ${formatIdentifier(prof.id)}`
      })),
      val => callbacks.onUpdatePreviewConfig({ prof: val })
    );

    buildTextureGrid(
      elements.biomeGrid,
      BIOME_NAMES.map((biome, index) => ({
        val: index,
        label: formatIdentifier(biome),
        title: `${index}: ${formatIdentifier(biome)}`
      })),
      val => callbacks.onUpdatePreviewConfig({ biome: val })
    );

    buildTextureGrid(
      elements.skinGrid,
      SKINS.map((_, index) => ({
        val: index,
        label: `Skin ${index}`,
        title: `Skin ID ${index}`
      })),
      val => callbacks.onUpdatePreviewConfig({ skin: val })
    );
  }

  buildEyesGrid(renderedEye) {
    const styleName = eyeStyle(renderedEye);
    const [startIdx, endIdx] = eyeRange(styleName);
    const items = Array.from({ length: Math.max(0, endIdx - startIdx + 1) }, (_, i) => {
      const val = startIdx + i;
      return {
        val,
        hex: this.lookups.eyeHex(val),
        title: `${val} (${styleName} ${this.lookups.eyeName(val)})`
      };
    });

    buildSwatchGrid(this.elements.eyesGrid, items, val => this.callbacks.onPatchLook({ e: val }));
  }

  buildHairGrid(renderedHair) {
    const styleName = hairStyle(renderedHair);
    const [startIdx, endIdx] = hairRange(styleName);
    const items = Array.from({ length: Math.max(0, endIdx - startIdx + 1) }, (_, i) => {
      const val = startIdx + i;
      return {
        val,
        hex: this.lookups.hairHex(val),
        title: `${val} ${this.lookups.hairName(val)}`
      };
    });

    buildSwatchGrid(this.elements.hairGrid, items, val => this.callbacks.onPatchLook({ h: val }));
  }

  applyThumbnails(thumbs) {
    const { elements } = this;
    applyGridThumbnails(elements.profGrid, thumbs.profThumbs);
    applyGridThumbnails(elements.biomeGrid, thumbs.biomeThumbs);
    applyGridThumbnails(elements.skinGrid, thumbs.skinThumbs);
    applyGridThumbnails(elements.hairSegment, thumbs.hairThumbs);
    applyGridThumbnails(elements.eyesSegment, thumbs.eyeThumbs);
    applyGridThumbnails(elements.noseSegment, thumbs.noseThumbs);
  }

  bindEvents() {
    const { elements, callbacks } = this;

    document.querySelectorAll('.mii-tab').forEach(button => {
      button.addEventListener('click', () => this.openTab(button.dataset.tab));
    });

    elements.soundBtn.onclick = () => {
      const muted = callbacks.onToggleSfx();
      elements.soundBtn.innerHTML = muted
        ? '<span class="sound-icon">🔇</span> SFX OFF'
        : '<span class="sound-icon">🔊</span> SFX ON';
    };

    elements.musicBtn.onclick = () => {
      playSelect();
      const enabled = callbacks.onToggleMusic();
      elements.musicBtn.innerHTML = enabled
        ? '<span class="music-icon">🎵</span> Music ON'
        : '<span class="music-icon">🔇</span> Music OFF';
    };

    elements.simShiftCheckbox.onchange = event => {
      playToggle();
      callbacks.onToggleShiftSim(event.target.checked);
    };

    elements.specialBtn.onclick = () => {
      playToggle();
      callbacks.onToggleSpecial();
    };

    elements.genderSegment.querySelectorAll('button[data-k]').forEach(button => {
      button.onclick = () => {
        playToggle();
        playVillagerAccept();
        callbacks.onChangeGender(button.dataset.k);
      };
    });

    elements.heightSlider.oninput = event => {
      callbacks.onPatchLook({ t: +event.target.value });
    };

    elements.tierSelect.onchange = event => {
      playSelect();
      callbacks.onUpdateTier(+event.target.value);
    };

    elements.nameInput.addEventListener('input', event => {
      callbacks.onNameInput(event.target.value);
    });

    elements.searchInput.oninput = () => callbacks.onSearchOrFilterChange();

    document.querySelectorAll('[data-f]').forEach(button => {
      button.onclick = () => {
        playTab();
        document.querySelectorAll('[data-f]').forEach(btn => {
          btn.setAttribute('aria-pressed', String(btn === button));
        });
        callbacks.onFilterChange(button.dataset.f);
      };
    });

    elements.saveBtn.onclick = () => {
      if (!elements.nameInput.value.trim()) {
        elements.nameInput.focus();
        return;
      }
      playSave();
      playVillagerAccept(0.7);
      callbacks.onSave();
    };

    elements.resetBtn.onclick = () => {
      playToggle();
      callbacks.onReset();
    };

    elements.randomBtn.onclick = () => {
      playRandom();
      playVillagerAccept(0.4);
      callbacks.onRandomize();
    };

    elements.exportEditsBtn.onclick = () => { playSelect(); callbacks.onExportEdits(); };
    elements.exportAllBtn.onclick = () => { playSelect(); callbacks.onExportAll(); };
    elements.exportCSVBtn.onclick = () => { playSelect(); callbacks.onExportCSV(); };
    elements.exportRPBtn.onclick = () => { playSave(); callbacks.onExportRP(); };

    elements.importBtn.onclick = () => {
      playSelect();
      elements.fileInput.click();
    };

    elements.fileInput.onchange = async event => {
      const file = event.target.files[0];
      if (!file) return;
      await callbacks.onImportFile(file);
      event.target.value = '';
    };

    elements.paradeBtn.onclick = () => {
      playToggle();
      const isParade = callbacks.onToggleParade();
      elements.paradeBtn.textContent = isParade ? 'Parade ON' : 'Parade OFF';
      elements.paradeBtn.setAttribute('aria-pressed', String(isParade));
    };

    elements.viewPlazaBtn.onclick = () => {
      playSelect();
      callbacks.onRequestPlaza();
    };
  }

  openTab(targetId, { quiet = false, instant = false } = {}) {
    document.querySelectorAll('.mii-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === targetId);
    });
    document.querySelectorAll('.tab-content').forEach(section => {
      section.hidden = section.id !== targetId;
    });

    this.activeTab = targetId;
    const focusTarget = TAB_FOCUS_MAP[targetId] || 'full';
    this.callbacks.onTabChange(focusTarget, instant);

    if (!quiet) playTab();
  }

  resetStyleCache() {
    this.lastHairStyle = null;
    this.lastEyeStyle = null;
  }

  setNameInputValue(name) {
    this.elements.nameInput.value = name;
  }

  setShiftSimChecked(checked) {
    this.elements.simShiftCheckbox.checked = checked;
  }

  setStatus(message) {
    this.elements.status.textContent = message;
  }

  sync(state, simulation, appData) {
    const { elements, lookups, manifest } = this;
    const current = state.current;

    elements.typeLabel.textContent = current.s ? '★ Locked Special' : 'Shifts by 6 × Prof';
    elements.genderSegment.querySelectorAll('button[data-k]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.k === current.k));
    });
    elements.specialBtn.setAttribute('aria-pressed', String(!!current.s));

    const currentEyeStyle = eyeStyle(simulation.e);
    const baseEyeStyle = eyeStyle(current.e);
    const shownEyeText = `${simulation.e} · ${currentEyeStyle} ${lookups.eyeName(simulation.e)}`;
    elements.eyesLabel.textContent = simulation.e !== current.e
      ? `${shownEyeText} (Base ${current.e} · ${baseEyeStyle} ${lookups.eyeName(current.e)})`
      : shownEyeText;

    const currentHairStyle = hairStyle(simulation.h);
    const baseHairStyle = hairStyle(current.h);
    const shownHairText = currentHairStyle === 'bald'
      ? `bald (${BALD_HAIR_INDEX})`
      : `${simulation.h} · ${currentHairStyle} ${lookups.hairName(simulation.h)}`;
    const baseHairText = baseHairStyle === 'bald'
      ? `bald (${BALD_HAIR_INDEX})`
      : `Base ${current.h} · ${baseHairStyle} ${lookups.hairName(current.h)}`;
    elements.hairLabel.textContent = simulation.h !== current.h
      ? `${shownHairText} (${baseHairText})`
      : shownHairText;

    const shownOutfitText = `${simulation.o} · ${manifest.colors[simulation.o - 1]}`;
    elements.outfitLabel.textContent = simulation.o !== current.o
      ? `${shownOutfitText} (Base ${current.o} · ${manifest.colors[current.o - 1]})`
      : shownOutfitText;

    elements.heightLabel.textContent = simulation.t !== current.t
      ? `${simulation.t} (Base ${current.t})`
      : simulation.t;
    elements.heightSlider.value = simulation.t;

    if (currentHairStyle !== this.lastHairStyle) {
      this.buildHairGrid(simulation.h);
      this.lastHairStyle = currentHairStyle;
    }
    if (currentEyeStyle !== this.lastEyeStyle) {
      this.buildEyesGrid(simulation.e);
      this.lastEyeStyle = currentEyeStyle;
    }

    markTextureSelection(elements.eyesSegment, currentEyeStyle, 's');
    markTextureSelection(elements.hairSegment, currentHairStyle, 's');

    const shownNose = NOSE_STYLES[simulation.n | 0];
    const baseNose = NOSE_STYLES[current.n | 0];
    elements.noseLabel.textContent = (simulation.n | 0) !== (current.n | 0)
      ? `${shownNose} (Base ${baseNose})`
      : shownNose;
    markTextureSelection(elements.noseSegment, simulation.n | 0, 'v');

    markSwatchSelection(elements.eyesGrid, simulation.e);
    markSwatchSelection(elements.hairGrid, simulation.h);
    markSwatchSelection(elements.outfitGrid, simulation.o);

    elements.skinToneLabel.textContent = SKIN_TONES[simulation.sk | 0]?.name || '';
    markSwatchSelection(elements.skinToneGrid, simulation.sk | 0);

    this.syncPreviewConfig(state.previewConfig);
    this.syncDirtyStatus(state, appData);
  }

  syncPreviewConfig(previewConfig) {
    const { elements, manifest } = this;
    markTextureSelection(elements.profGrid, previewConfig.prof, 'v');
    markTextureSelection(elements.biomeGrid, previewConfig.biome, 'v');
    markTextureSelection(elements.skinGrid, previewConfig.skin, 'v');

    const profObj = manifest.professions[previewConfig.prof];
    elements.profLabel.textContent = `${previewConfig.prof} · ${profObj ? formatIdentifier(profObj.id) : ''}`;
    elements.biomeLabel.textContent = `${previewConfig.biome} · ${formatIdentifier(BIOME_NAMES[previewConfig.biome] || '')}`;
    elements.skinLabel.textContent = `ID ${previewConfig.skin}`;
    elements.tierSelect.value = previewConfig.tier;
  }

  syncDirtyStatus(state, appData) {
    const { chip, resetBtn } = this.elements;
    const name = state.current.name;
    const exists = !!state.lookup(name);
    const isEdited = !!appData.over[name];
    const dirty = state.isDirty();

    chip.className = dirty ? 'unsaved' : '';
    chip.textContent = !name
      ? 'Unnamed Preview'
      : !exists
        ? (dirty ? 'New · unsaved' : 'New')
        : dirty
          ? 'Unsaved changes'
          : isEdited
            ? 'Edited'
            : 'From sheet';

    resetBtn.textContent = isEdited && appData.base[name]
      ? 'Reset to sheet'
      : isEdited
        ? 'Delete'
        : 'Reset';
  }

  renderVillagerList(state, appData) {
    const { searchInput, countLabel, listContainer } = this.elements;
    const query = searchInput.value.trim().toLowerCase();
    const allNames = state.getAllNames({ sorted: true });

    const matches = allNames.filter(name => {
      const matchesSearch = !query || name.toLowerCase().includes(query);
      const record = state.lookup(name);
      const matchesFilter = state.filter === 'all' ||
        (state.filter === 'edited' ? appData.over[name] : record?.s);
      return matchesSearch && matchesFilter;
    });

    if (query) {
      const rankMatch = name => {
        const lower = name.toLowerCase();
        if (lower.startsWith(query)) return 0;
        if (lower.split(/[\s_\-'.]+/).some(word => word.startsWith(query))) return 1;
        return 2;
      };
      matches.sort((a, b) => rankMatch(a) - rankMatch(b));
    }

    countLabel.textContent = `(${matches.length})`;

    const rows = matches.slice(0, 300).map(name => {
      const button = document.createElement('button');
      button.className = 'row';
      button.setAttribute('role', 'listitem');
      if (name === state.current.name) button.setAttribute('aria-current', 'true');

      const record = state.lookup(name);
      button.innerHTML = `<span>${appData.over[name] ? '<i class="dot"></i>' : ''}</span><small></small>`;
      button.firstChild.append(name);
      button.lastChild.textContent = record.s ? `★ ${record.k}` : (record.k === 'f' ? '♀' : '♂');

      button.onclick = () => {
        playSelect();
        this.callbacks.onSelectVillager(name);
      };
      return button;
    });

    listContainer.replaceChildren(...rows);

    if (matches.length > 300) {
      const disclaimer = document.createElement('p');
      disclaimer.style.cssText = 'color:var(--wii-muted);font-size:12px;padding:6px 10px';
      disclaimer.textContent = `Showing 300 of ${matches.length}. Search to narrow.`;
      listContainer.append(disclaimer);
    }

    bindHoverSounds(listContainer);
  }

  preparePlazaDOM(freshLoad = false) {
    if (freshLoad) {
      document.querySelectorAll('#plazaCv, #plazaLabels, #plazaHint').forEach(el => el.remove());
    }

    if (!document.querySelector('#plazaCv')) {
      const canvas = document.createElement('canvas');
      canvas.id = 'plazaCv';
      canvas.setAttribute('aria-label', 'Villager plaza. Pick a villager to edit.');

      const labels = document.createElement('div');
      labels.id = 'plazaLabels';

      const hint = document.createElement('div');
      hint.id = 'plazaHint';
      hint.innerHTML = '<strong>Villager Plaza</strong><span>Pick a villager to edit</span>';

      this.elements.body.prepend(canvas, labels, hint);
    }

    const canvas = document.querySelector('#plazaCv');
    if (freshLoad) canvas.style.opacity = '0';

    return {
      canvas,
      labelsEl: document.querySelector('#plazaLabels'),
      hintEl: document.querySelector('#plazaHint'),
      stageEl: this.elements.stage
    };
  }

  clearPlazaDOM() {
    document.querySelectorAll('#plazaCv, #plazaLabels, #plazaHint').forEach(el => el.remove());
    this.elements.body.classList.remove('plaza-mode', 'plaza-hold', 'plaza-leaving');
  }

  setPlazaBodyState({ mode, hold, leaving }) {
    const { classList } = this.elements.body;
    if (mode !== undefined) classList.toggle('plaza-mode', mode);
    if (hold !== undefined) classList.toggle('plaza-hold', hold);
    if (leaving !== undefined) classList.toggle('plaza-leaving', leaving);
  }

  setupIntroScreen(onStartIntro) {
    const { introScreen } = this.elements;
    if (!introScreen) return;

    let isBegun = false;
    const triggerIntro = async () => {
      if (isBegun) return;
      isBegun = true;
      introScreen.classList.add('leaving');
      setTimeout(() => introScreen.remove(), 1600);
      await onStartIntro();
    };

    introScreen.addEventListener('click', triggerIntro);
    introScreen.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        triggerIntro();
      }
    });
    introScreen.focus();
  }

  markIntroReady() {
    this.elements.introScreen?.classList.add('ready');
  }
}