import {
  createLookups, eyeColor, eyeIndex, hairColor, hairIndex, hairStyle,
  computeInGameLook, loadAppData
} from '../data.js';
import { initViewer } from '../viewer.js';
import {
  playSave, toggleMute, loadMusic, playIntro, startMusic,
  setMusicEnabled, isMusicEnabled, loadSfx
} from '../sound.js';
import { EditorState } from '../core/EditorState.js';
import { UIController } from '../ui/UIController.js';
import { ExportCarrier } from '../ExportCarrier.js';
import { ExportService } from './ExportService.js';
import { PlazaController } from './PlazaController.js';
import { RandomizeSequence } from './RandomizeSequence.js';
import { rollRandomLook } from './randomLook.js';
import { mergeImportedRecords, readVillagerRecords } from './VillagerImport.js';

const DEFAULT_VILLAGER = 'Abren';
const DEFAULT_EYE_COLOR = 1;
const DEFAULT_HAIR_COLOR = 16;

export class VillagerMakerApp {
  async initialize() {
    this.appData = await loadAppData();
    this.state = new EditorState(this.appData.base, this.appData.over, this.appData.persist);
    this.lookups = createLookups(this.appData.M);

    this.ui = new UIController({
      manifest: this.appData.M,
      lookups: this.lookups,
      callbacks: this.createUICallbacks()
    });
    this.ui.initialize();

    this.createServices();
    this.createViewer();

    this.viewer.renderThumbnails().then(thumbs => this.ui.applyThumbnails(thumbs));

    const initialVillager = this.appData.base[DEFAULT_VILLAGER]
      ? DEFAULT_VILLAGER
      : Object.keys(this.appData.base)[0];
    this.setActiveVillager(initialVillager);
    this.plaza.launch();
    this.initializeAudioAndIntro();
  }

  createServices() {
    const { appData, state, lookups, ui } = this;

    this.plaza = new PlazaController({
      state, appData, lookups, ui,
      selectVillager: name => this.setActiveVillager(name)
    });
    this.randomizer = new RandomizeSequence({
      ui, state, appData, lookups,
      plaza: this.plaza,
      onRandomizeCurrent: () => this.randomizeCurrentVillager()
    });
    this.exporter = new ExportService({
      appData, state, lookups,
      setStatus: message => ui.setStatus(message)
    });
  }

  createViewer() {
    const { elements } = this.ui;

    this.viewer = initViewer({
      canvas: elements.canvas,
      stageEl: elements.stage,
      spinCheckbox: elements.spinCheckbox,
      GEO: this.appData.GEO,
      M: this.appData.M,
      lookups: this.lookups
    });

    this.carrier = new ExportCarrier({
      canvas: elements.carryCanvas,
      hoverTarget: elements.shareBtn,
      slots: elements.carrySlots,
      GEO: this.appData.GEO,
      texture: this.viewer.texture,
      noseTextures: this.viewer.noseTextures,
      noseTexturesReady: this.viewer.noseTexturesReady
    });
  }

  createUICallbacks() {
    return {
      onSelectVillager: name => this.setActiveVillager(name),
      onNameInput: name => this.handleNameInput(name),
      onPatchLook: patch => this.patchLook(patch),
      onSelectEyeStyle: style => {
        const rendered = this.getRenderedLook();
        this.patchLook({ e: eyeIndex(style, eyeColor(rendered.e) || DEFAULT_EYE_COLOR) });
      },
      onSelectHairStyle: style => {
        const rendered = this.getRenderedLook();
        this.patchLook({ h: hairIndex(style, hairColor(rendered.h) || DEFAULT_HAIR_COLOR) });
      },
      onSelectSkinTone: toneIndex => {
        this.state.current.sk = toneIndex;
        this.syncApplication();
      },
      onUpdatePreviewConfig: configPatch => {
        Object.assign(this.state.previewConfig, configPatch);
        this.syncApplication();
      },
      onUpdateTier: tier => {
        this.state.previewConfig.tier = tier;
        this.updatePreview();
      },
      onToggleShiftSim: isSimulated => {
        this.state.isShiftSimulated = isSimulated;
        this.syncApplication();
      },
      onToggleSpecial: () => {
        this.state.current.s = this.state.current.s ? 0 : 1;
        this.syncApplication();
      },
      onChangeGender: gender => this.handleGenderChange(gender),
      onSearchOrFilterChange: () => this.renderList(),
      onFilterChange: filter => {
        this.state.filter = filter;
        this.renderList();
      },
      onShareToggle: open => this.carrier?.setShareOpen(open),
      onExportViewChange: (open, instant) => this.carrier?.setActive(open, instant),
      onTabChange: (focusTarget, instant) => {
        this.updatePreview();
        this.viewer.focus(focusTarget, instant);
      },
      onSave: () => {
        this.state.saveCurrent();
        this.ui.setNameInputValue(this.state.current.name);
        this.syncApplication();
      },
      onReset: () => this.resetCurrentVillager(),
      onRandomize: () => this.randomizer.run(),
      onExportEdits: () => this.exporter.exportEdits(),
      onExportAll: () => this.exporter.exportAll(),
      onExportRP: mode => this.exporter.exportBedrockRP(mode),
      onImportFile: file => this.importVillagerFile(file),
      onToggleParade: () => this.plaza.toggleParade(),
      onRequestPlaza: () => this.plaza.reopen(),
      onToggleSfx: () => toggleMute(),
      onToggleMusic: () => {
        const enabled = !isMusicEnabled();
        setMusicEnabled(enabled);
        return enabled;
      }
    };
  }

  getRenderedLook() {
    const { current, previewConfig, isShiftSimulated } = this.state;
    return computeInGameLook(
      current.name,
      current,
      previewConfig.prof,
      previewConfig.skin,
      previewConfig.biome,
      isShiftSimulated
    );
  }

  patchLook(patch) {
    this.state.applyPreviewPatch(patch);
    this.syncApplication();
  }

  updatePreview() {
    const simulation = this.getRenderedLook();
    this.viewer.setHeight(simulation.t);
    this.viewer.setNose(simulation.n);
    this.carrier?.setHeight(simulation.t);
    this.carrier?.setNose(simulation.n);
    this.viewer.compose(
      simulation,
      this.state.previewConfig,
      this.ui.elements.shiftInfo,
      this.ui.elements.status
    );
  }

  renderList() {
    this.ui.renderVillagerList(this.state, this.appData);
  }

  syncApplication() {
    this.ui.sync(this.state, this.getRenderedLook(), this.appData);
    this.updatePreview();
    this.renderList();
  }

  setActiveVillager(name) {
    const record = this.state.lookup(name);
    const { current } = this.state;

    this.state.current = {
      name,
      n: 0,
      sk: 0,
      ...(record || {
        e: current.e,
        h: current.h,
        o: current.o,
        t: current.t,
        k: current.k,
        n: current.n | 0,
        sk: current.sk | 0,
        s: 0
      })
    };
    this.state.saved = record || null;

    this.ui.setNameInputValue(name);
    this.ui.resetStyleCache();
    this.syncApplication();
  }

  handleNameInput(name) {
    const record = this.state.lookup(name);

    if (record) {
      this.state.current = { name, n: 0, sk: 0, ...record };
      this.state.saved = record;
      this.ui.resetStyleCache();
    } else {
      this.state.current.name = name;
      this.state.saved = null;
    }
    this.syncApplication();
  }

  handleGenderChange(gender) {
    this.state.current.k = gender;
    const rendered = this.getRenderedLook();
    const style = hairStyle(rendered.h);

    if (!this.state.current.s && (style === 'ari' || style === 'alex')) {
      const target = gender === 'f' ? 'alex' : 'ari';
      this.state.applyPreviewPatch({ h: hairIndex(target, hairColor(rendered.h)) });
    }
    this.syncApplication();
  }

  resetCurrentVillager() {
    const { name } = this.state.current;

    if (this.appData.over[name]) {
      delete this.appData.over[name];
      this.appData.persist();
      this.setActiveVillager(name);
    } else if (this.state.saved) {
      this.setActiveVillager(name);
    }
  }

  randomizeCurrentVillager() {
    Object.assign(this.state.current, rollRandomLook(this.state.current.k));
    this.syncApplication();
  }

  async importVillagerFile(file) {
    let records;
    try {
      records = await readVillagerRecords(file);
    } catch {
      this.ui.setStatus('Could not read that file. Use a villager JSON export or a sheet CSV.');
      return;
    }

    const imported = mergeImportedRecords(records, this.appData);

    playSave();
    this.appData.persist();
    this.renderList();
    this.ui.setStatus(`Imported ${imported} villagers into your edits.`);
    if (this.state.current.name) this.setActiveVillager(this.state.current.name);
  }

  initializeAudioAndIntro() {
    loadMusic().then(() => this.ui.markIntroReady());
    loadSfx();

    this.ui.setupIntroScreen(async () => {
      await playIntro();
      startMusic();
    });
  }
}