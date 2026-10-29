import {
  clamp, createLookups, eyeStyle, eyeColor, eyeIndex, EYE_STYLES, EYE_MAX,
  hairStyle, hairColor, hairIndex, HAIR_STYLES, HAIR_MAX,
  sheetToRecords, computeInGameLook, loadAppData, NOSE_STYLES, SKIN_TONES
} from './data.js';
import { initViewer } from './viewer.js';
import { generateBedrockFiles, generateCSVText } from './exporter.js';
import {
  playSelect, playTab, playSave, toggleMute, loadMusic,
  playIntro, startMusic, setMusicScene, setMusicEnabled, isMusicEnabled, loadSfx
} from './sound.js';
import { PlazaScene } from './plaza.js';
import { EditorState } from './core/EditorState.js';
import { UIController } from './ui/UIController.js';

function triggerDownload(content, filename) {
  const anchor = document.createElement('a');
  const payload = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  anchor.href = URL.createObjectURL(new Blob([payload], { type: 'application/octet-stream' }));
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

class VillagerMakerApp {
  constructor() {
    this.appData = null;
    this.state = null;
    this.lookups = null;
    this.ui = null;
    this.viewer = null;
    this.plazaApi = null;
    this.isParadeActive = false;
  }

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

    this.viewer = initViewer({
      canvas: this.ui.elements.canvas,
      stageEl: this.ui.elements.stage,
      spinCheckbox: this.ui.elements.spinCheckbox,
      GEO: this.appData.GEO,
      M: this.appData.M,
      lookups: this.lookups
    });

    this.viewer.renderThumbnails().then(thumbs => this.ui.applyThumbnails(thumbs));

    const initialVillager = this.appData.base.Abren ? 'Abren' : Object.keys(this.appData.base)[0];
    this.setActiveVillager(initialVillager);
    this.launchPlaza();
    this.initializeAudioAndIntro();
  }

  createUICallbacks() {
    return {
      onSelectVillager: name => this.setActiveVillager(name),
      onNameInput: name => this.handleNameInput(name),
      onPatchLook: patch => {
        this.state.applyPreviewPatch(patch);
        this.syncApplication();
      },
      onSelectEyeStyle: style => {
        const rendered = this.getRenderedLook();
        this.state.applyPreviewPatch({ e: eyeIndex(style, eyeColor(rendered.e) || 1) });
        this.syncApplication();
      },
      onSelectHairStyle: style => {
        const rendered = this.getRenderedLook();
        this.state.applyPreviewPatch({ h: hairIndex(style, hairColor(rendered.h) || 16) });
        this.syncApplication();
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
      onSearchOrFilterChange: () => this.ui.renderVillagerList(this.state, this.appData),
      onFilterChange: filter => {
        this.state.filter = filter;
        this.ui.renderVillagerList(this.state, this.appData);
      },
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
      onRandomize: () => this.randomizeCurrentVillager(),
      onExportEdits: () => triggerDownload(this.appData.over, 'villager-edits.json'),
      onExportAll: () => this.exportAllVillagers(),
      onExportCSV: () => this.exportCSV(),
      onExportRP: () => this.exportBedrockRP(),
      onImportFile: file => this.importVillagerFile(file),
      onToggleParade: () => this.toggleParade(),
      onRequestPlaza: () => this.reopenPlaza(),
      onToggleSfx: () => toggleMute(),
      onToggleMusic: () => {
        const nextState = !isMusicEnabled();
        setMusicEnabled(nextState);
        return nextState;
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

  updatePreview() {
    const simulation = this.getRenderedLook();
    this.viewer.setHeight(simulation.t);
    this.viewer.setNose(simulation.n);
    this.viewer.compose(
      simulation,
      this.state.previewConfig,
      this.ui.elements.shiftInfo,
      this.ui.elements.status
    );
  }

  syncApplication() {
    const simulation = this.getRenderedLook();
    this.ui.sync(this.state, simulation, this.appData);
    this.updatePreview();
    this.ui.renderVillagerList(this.state, this.appData);
  }

  setActiveVillager(name) {
    const record = this.state.lookup(name);
    const current = this.state.current;

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

  handleNameInput(nameStr) {
    const record = this.state.lookup(nameStr);
    if (record) {
      this.state.current = { name: nameStr, n: 0, sk: 0, ...record };
      this.state.saved = record;
      this.ui.resetStyleCache();
    } else {
      this.state.current.name = nameStr;
      this.state.saved = null;
    }
    this.syncApplication();
  }

  handleGenderChange(gender) {
    this.state.current.k = gender;
    const rendered = this.getRenderedLook();
    const currentStyle = hairStyle(rendered.h);

    if (!this.state.current.s && (currentStyle === 'ari' || currentStyle === 'alex')) {
      const targetStyle = gender === 'f' ? 'alex' : 'ari';
      this.state.applyPreviewPatch({ h: hairIndex(targetStyle, hairColor(rendered.h)) });
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
    const randomInt = max => 1 + Math.floor(Math.random() * max);
    const randomEyeStyle = EYE_STYLES[randomInt(EYE_STYLES.length) - 1];

    this.state.current.e = eyeIndex(randomEyeStyle, randomInt(34));
    this.state.current.o = randomInt(34);
    this.state.current.t = randomInt(34);
    this.state.current.n = randomInt(NOSE_STYLES.length) - 1;
    this.state.current.sk = randomInt(SKIN_TONES.length) - 1;

    const defaultGenderHair = this.state.current.k === 'f' ? 'alex' : 'ari';
    const randomHairStyle = Math.random() < 0.05
      ? 'bald'
      : Math.random() < 0.5
        ? defaultGenderHair
        : HAIR_STYLES[randomInt(HAIR_STYLES.length) - 1];

    this.state.current.h = hairIndex(randomHairStyle, randomInt(35));
    this.syncApplication();
  }

  exportAllVillagers() {
    const allKeys = Object.keys({ ...this.appData.base, ...this.appData.over }).sort();
    const combined = Object.fromEntries(allKeys.map(name => [name, this.state.lookup(name)]));
    triggerDownload(combined, 'villagers-all.json');
  }

  exportCSV() {
    const csvText = generateCSVText(
      this.appData.base,
      this.appData.over,
      this.state.lookup.bind(this.state)
    );
    triggerDownload(csvText, 'Villager Names - Sheet1.csv');
    this.ui.setStatus('Exported Villager Names - Sheet1.csv.');
  }

  exportBedrockRP() {
    const { entityJson, rcJson, stats } = generateBedrockFiles(
      this.appData.M,
      this.appData.base,
      this.appData.over,
      this.state.lookup.bind(this.state),
      this.lookups
    );

    triggerDownload(entityJson, 'villager_v2.entity.json');
    setTimeout(() => triggerDownload(rcJson, 'villager_v2.render_controllers.json'), 250);

    const noseGeos = Object.fromEntries(
      Object.entries(this.appData.GEO).filter(([key]) => key.startsWith('geometry.villager_nose_'))
    );
    if (Object.keys(noseGeos).length) {
      setTimeout(() => {
        triggerDownload(
          { format_version: this.appData.GEO.format_version || '1.8.0', ...noseGeos },
          'villager_nose.geo.json'
        );
      }, 500);
    }

    this.ui.setStatus(
      `Exported Bedrock RP files (${stats.regularCount} shifted regulars + ${stats.specialCount} locked specials).`
    );
  }

  async importVillagerFile(file) {
    const text = await file.text();
    let records;

    try {
      records = file.name.endsWith('.csv') ? sheetToRecords(text) : JSON.parse(text);
    } catch {
      this.ui.setStatus('Could not read that file. Use a villager JSON export or a sheet CSV.');
      return;
    }

    let importedCount = 0;
    for (const [key, rec] of Object.entries(records)) {
      if (!rec || typeof rec.e !== 'number') continue;

      const parsedRecord = {
        e: clamp(rec.e, 1, EYE_MAX),
        h: clamp(rec.h, 0, HAIR_MAX),
        o: clamp(rec.o, 1, 34),
        t: clamp(rec.t, 1, 34),
        k: rec.k || 'm',
        ...(rec.s ? { s: 1 } : {}),
        ...(rec.n ? { n: clamp(rec.n, 0, NOSE_STYLES.length - 1) } : {}),
        ...(rec.sk !== undefined ? { sk: clamp(rec.sk, 0, SKIN_TONES.length - 1) } : {})
      };

      if (this.appData.base[key] && JSON.stringify(this.appData.base[key]) === JSON.stringify(parsedRecord)) {
        delete this.appData.over[key];
      } else {
        this.appData.over[key];
        this.appData.over[key] = parsedRecord;
      }
      importedCount++;
    }

    playSave();
    this.appData.persist();
    this.ui.renderVillagerList(this.state, this.appData);
    this.ui.setStatus(`Imported ${importedCount} villagers into your edits.`);
    if (this.state.current.name) {
      this.setActiveVillager(this.state.current.name);
    }
  }

  launchPlaza(freshLoad = false) {
    const allNames = [...new Set([...Object.keys(this.appData.base), ...Object.keys(this.appData.over)])]
      .filter(name => this.state.lookup(name));

    if (!allNames.length) {
      this.ui.setPlazaBodyState({ mode: false, hold: false, leaving: false });
      return;
    }

    const plazaElements = this.ui.preparePlazaDOM(freshLoad);

    try {
      this.plazaApi = new PlazaScene({
        ...plazaElements,
        GEO: this.appData.GEO,
        M: this.appData.M,
        lookups: this.lookups,
        names: allNames,
        lookup: this.state.lookup.bind(this.state),
        count: 10,
        parade: this.isParadeActive,
        onPick: (name, lookConfig) => {
          playSelect();
          setMusicScene('edit');
          this.ui.setPlazaBodyState({ leaving: true });

          Object.assign(this.state.previewConfig, lookConfig);
          this.state.isShiftSimulated = true;
          this.ui.setShiftSimChecked(true);

          this.ui.syncPreviewConfig(this.state.previewConfig);
          this.setActiveVillager(name);
          this.ui.openTab('tab-plaza', { quiet: true, instant: true });
        },
        onReveal: () => {
          this.ui.setPlazaBodyState({ mode: false, leaving: false });
          playTab();
        },
        onHandoff: () => {
          this.plazaApi = null;
          this.ui.setPlazaBodyState({ hold: false });
        }
      });

      this.plazaApi.initialize();
      if (freshLoad) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          plazaElements.canvas.style.opacity = '';
        }));
      }
    } catch (error) {
      console.warn('Plaza failed, opening the editor instead', error);
      this.plazaApi = null;
      this.ui.clearPlazaDOM();
    }
  }

  toggleParade() {
    this.isParadeActive = !this.isParadeActive;
    if (this.plazaApi) {
      this.plazaApi.setParade(this.isParadeActive);
    }
    setMusicScene(this.isParadeActive ? 'parade' : 'plaza');
    return this.isParadeActive;
  }

  reopenPlaza() {
    if (this.plazaApi) return;
    setMusicScene(this.isParadeActive ? 'parade' : 'plaza');
    this.ui.openTab('tab-plaza', { quiet: true, instant: true });
    this.ui.setPlazaBodyState({ mode: true, hold: true, leaving: false });
    this.launchPlaza(true);
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

const app = new VillagerMakerApp();
app.initialize();