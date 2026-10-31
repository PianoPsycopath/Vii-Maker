import {
  clamp, createLookups, eyeStyle, eyeColor, eyeIndex, EYE_STYLES, EYE_MAX,
  hairStyle, hairColor, hairIndex, HAIR_STYLES, HAIR_MAX,
  sheetToRecords, computeInGameLook, loadAppData, NOSE_STYLES, SKIN_TONES,
  COLOR_COUNT, EYE_COLORS, HAIR_COLOR_COUNT
} from './data.js';
import { initViewer } from './viewer.js';
import {
  playSelect, playTab, playSave, playVillagerAccept, toggleMute, loadMusic,
  playIntro, startMusic, setMusicScene, setMusicEnabled, isMusicEnabled, loadSfx
} from './sound.js';
import {
  buildBedrockFiles, loadTextures, describeMissingTextures, pickResourcePackRoot,
  zipSimple, zipAddon, weaveIntoPack, toFileText
} from './PackExport.js';
import { createComposer } from './composer.js';
import { generatePackIcon, PACK_ICON_VILLAGER } from './PackIcon.js';
import { PlazaScene } from './plaza.js';
import { EditorState } from './core/EditorState.js';
import { UIController } from './ui/UIController.js';
import { ExportCarrier } from './ExportCarrier.js';

function triggerDownload(content, filename) {
  const anchor = document.createElement('a');
  const payload = content instanceof Uint8Array ? content : toFileText(content);
  anchor.href = URL.createObjectURL(new Blob([payload], { type: 'application/octet-stream' }));
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 10000);
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
    this.iconComposer = null;
    this.isRandomizing = false;
    // The crowd that was in the plaza when a villager was picked, so we can come back to the same plaza.
    this.plazaRoster = null;
    this.carrier = null;
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

    this.carrier = new ExportCarrier({
      canvas: this.ui.elements.carryCanvas,
      hoverTarget: this.ui.elements.shareBtn,
      slots: this.ui.elements.carrySlots,
      GEO: this.appData.GEO,
      texture: this.viewer.texture,
      noseTextures: this.viewer.noseTextures,
      noseTexturesReady: this.viewer.noseTexturesReady
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
      onRandomize: () => this.playRandomizeSequence(),
      onExportEdits: () => triggerDownload(this.appData.over, 'villager-edits.json'),
      onExportAll: () => this.exportAllVillagers(),
      onExportRP: mode => this.exportBedrockRP(mode),
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
    this.carrier?.setHeight(simulation.t);
    this.carrier?.setNose(simulation.n);
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

  rollRandomLook(gender) {
    const randomInt = max => 1 + Math.floor(Math.random() * max);
    const randomEyeStyle = EYE_STYLES[randomInt(EYE_STYLES.length) - 1];

    const defaultGenderHair = gender === 'f' ? 'alex' : 'ari';
    const randomHairStyle = Math.random() < 0.05
      ? 'bald'
      : Math.random() < 0.5
        ? defaultGenderHair
        : HAIR_STYLES[randomInt(HAIR_STYLES.length) - 1];

    return {
      e: eyeIndex(randomEyeStyle, randomInt(EYE_COLORS)),
      o: randomInt(COLOR_COUNT),
      t: randomInt(COLOR_COUNT),
      n: randomInt(NOSE_STYLES.length) - 1,
      sk: randomInt(SKIN_TONES.length) - 1,
      h: hairIndex(randomHairStyle, randomInt(HAIR_COLOR_COUNT))
    };
  }

  randomizeCurrentVillager() {
    Object.assign(this.state.current, this.rollRandomLook(this.state.current.k));
    this.syncApplication();
  }


  async createGustPlaza(featured) {
    const names = this.state.getAllNames().filter(name => this.state.lookup(name));
    if (!names.length) return null;

    const lookup = name => {
      const record = this.state.lookup(name);
      return name === featured && record ? { ...record, ...this.state.getRecord() } : record;
    };

    const elements = this.ui.preparePlazaDOM(true);
    const plaza = new PlazaScene({
      ...elements,
      GEO: this.appData.GEO,
      M: this.appData.M,
      lookups: this.lookups,
      names,
      lookup,
      featured,
      count: 10,
      parade: false,
      interactive: false
    });
    await plaza.initialize();
    elements.hintEl.remove();
    return plaza;
  }

  async playRandomizeSequence() {
    if (this.isRandomizing || this.plazaApi) return;
    this.isRandomizing = true;

    const launch = this.ui.beginDiceLaunch();
    const featured = this.state.current.name && this.state.lookup(this.state.current.name) ? this.state.current.name : null;
    let plaza = null;
    let swap = null;

    try {
      try {
        this.ui.setPlazaBodyState({ mode: true, hold: true, leaving: false, gust: true });
        setMusicScene('plaza');
        plaza = await this.createGustPlaza(featured);
        if (!plaza) throw new Error('there are no villagers to show');

        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        plaza.canvas.style.opacity = '';
        await Promise.all([launch.rattled, new Promise(resolve => setTimeout(resolve, 500))]);
      } catch (error) {
        console.error('Randomize plaza failed', error);
        this.ui.clearPlazaDOM();
        plaza = null;
        this.ui.setStatus(`Randomize could not open the plaza: ${error.message}`);
      }

      if (plaza) {
        const reroll = plaza.prepareReroll((name, record) => this.rollRandomLook(record.k), featured)
          .catch(error => console.error('Could not prepare the new looks', error));

        const rolled = plaza.dropDice(launch.screen);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        launch.release();
        await rolled;
        await reroll;

        await plaza.playGust({
          onPeak: () => {
            plaza.applyReroll();
            this.randomizeCurrentVillager();
            if (featured) swap = plaza.refreshActor(featured);
          }
        });
        if (swap) await swap;
        if (plaza.gustMissing) {
          this.ui.setStatus('gust.png was not found (looked in img/, img/icons/, img/fx/, data/ and the site root), so the gust was skipped.');
        }
      } else {
        this.randomizeCurrentVillager();
      }

      playVillagerAccept(1);
      await new Promise(resolve => setTimeout(resolve, 500));

      if (plaza) {
        plaza.canvas.style.opacity = '0';
        plaza.labelsContainer.style.transition = 'opacity .4s ease';
        plaza.labelsContainer.style.opacity = '0';
      }
      this.ui.setPlazaBodyState({ mode: false, hold: false, leaving: false, gust: false });
      if (plaza) {
        await new Promise(resolve => setTimeout(resolve, 500));
        plaza.dispose();
      }
    } finally {
      launch.restore();
      setMusicScene('edit');
      this.ui.setPlazaBodyState({ mode: false, hold: false, leaving: false, gust: false });
      this.isRandomizing = false;
    }
  }

  exportAllVillagers() {
    const allKeys = Object.keys({ ...this.appData.base, ...this.appData.over }).sort();
    const combined = Object.fromEntries(allKeys.map(name => [name, this.state.lookup(name)]));
    triggerDownload(combined, 'villagers-all.json');
  }

  async exportBedrockRP(mode = 'simple') {
    try {
      const root = mode === 'weave' ? await pickResourcePackRoot() : null;

      const { json, texturePaths, stats } = buildBedrockFiles({
        manifest: this.appData.M,
        base: this.appData.base,
        over: this.appData.over,
        lookup: this.state.lookup.bind(this.state),
        lookups: this.lookups,
        GEO: this.appData.GEO
      });
      const counts = `${stats.regularCount} shifted regulars + ${stats.specialCount} locked specials`;

      if (mode === 'simple') {
        triggerDownload(zipSimple(json), 'villager_bedrock_rp.zip');
        this.ui.setStatus(`Exported villager_bedrock_rp.zip (${counts}).`);
        return;
      }

      this.ui.setStatus('Collecting textures...');
      const { files, missing } = await loadTextures(texturePaths);
      if (!Object.keys(files).length) {
        throw new Error('No textures could be loaded, so nothing was written. Check the texture location.');
      }
      const missingNote = describeMissingTextures(missing);

      if (mode === 'weave') {
        const written = await weaveIntoPack(root, json, files);
        this.ui.setStatus(`Wove ${written} files into "${root.name}" (${counts}).${missingNote}`);
      } else {
        const icon = await this.buildPackIcon();
        const packFiles = icon.bytes ? { ...files, 'pack_icon.png': icon.bytes } : files;
        triggerDownload(zipAddon(json, packFiles), 'Vii-Maker_Villagers.mcaddon');
        this.ui.setStatus(`Exported Vii-Maker_Villagers.mcaddon (${counts}).${missingNote}${icon.note}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this.ui.setStatus('Export cancelled.');
        return;
      }
      console.error('Bedrock export failed', error);
      this.ui.setStatus(`Export failed: ${error.message}`);
    }
  }

  async buildPackIcon() {
    try {
      this.iconComposer ??= createComposer({ M: this.appData.M, lookups: this.lookups });
      const bytes = await generatePackIcon({
        GEO: this.appData.GEO,
        M: this.appData.M,
        composer: this.iconComposer,
        lookup: this.state.lookup.bind(this.state)
      });
      return bytes
        ? { bytes, note: '' }
        : { bytes: null, note: ` No pack icon: villager "${PACK_ICON_VILLAGER.name}" not found.` };
    } catch (error) {
      console.warn('Pack icon failed', error);
      return { bytes: null, note: ' Pack icon could not be generated.' };
    }
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
        o: clamp(rec.o, 1, COLOR_COUNT),
        t: clamp(rec.t, 1, COLOR_COUNT),
        k: rec.k || 'm',
        ...(rec.s ? { s: 1 } : {}),
        ...(rec.n ? { n: clamp(rec.n, 0, NOSE_STYLES.length - 1) } : {}),
        ...(rec.sk !== undefined ? { sk: clamp(rec.sk, 0, SKIN_TONES.length - 1) } : {})
      };

      if (this.appData.base[key] && JSON.stringify(this.appData.base[key]) === JSON.stringify(parsedRecord)) {
        delete this.appData.over[key];
      } else {
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

  launchPlaza(freshLoad = false, restore = null) {
    const allNames = this.state.getAllNames().filter(name => this.state.lookup(name));

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
        names: restore ? restore.names : allNames,
        lookup: restore ? restore.lookup : this.state.lookup.bind(this.state),
        restore: restore ? restore.scene : null,
        count: 10,
        parade: this.isParadeActive,
        onPick: (name, lookConfig, roster) => {
          this.plazaRoster = roster;
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

      const plaza = this.plazaApi;
      const ready = plaza.initialize();
      if (restore) {
        plazaElements.labelsEl.style.visibility = 'hidden';
        ready
          .then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          .then(() => {
            if (this.plazaApi === plaza && !plaza.isDisposed) this.revealRestoredPlaza(plazaElements, !!restore.scene.featured);
          })
          .catch(error => {
            console.warn('Could not restore the plaza, starting a fresh one', error);
            try { plaza.dispose(); } catch {}
            if (this.plazaApi === plaza) this.plazaApi = null;
            this.plazaRoster = null;
            this.ui.setPlazaBodyState({ mode: true, hold: true, leaving: false });
            this.launchPlaza(true);
          });
      } else if (freshLoad) {
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

  buildPlazaRestore() {
    if (!this.plazaRoster?.length) return null;
    const { current, previewConfig, isShiftSimulated } = this.state;
    const name = (current.name || '').trim();
    const stage = this.ui.elements.stage.getBoundingClientRect();

    const record = {
      e: current.e, h: current.h, o: current.o, t: current.t, k: current.k,
      s: current.s ? 1 : 0, n: current.n | 0, sk: current.sk | 0
    };
    const lookup = villager => (name && villager === name ? record : this.state.lookup(villager));
    const names = this.state.getAllNames().filter(villager => lookup(villager));
    if (name && !names.includes(name)) names.push(name);

    return {
      names,
      lookup,
      scene: {
        roster: this.plazaRoster,
        featured: name ? { name, previewConfig: { ...previewConfig }, simShift: isShiftSimulated } : null,
        stageRect: { left: stage.left, top: stage.top, width: stage.width, height: stage.height }
      }
    };
  }

  revealRestoredPlaza({ canvas, labelsEl }, instant) {
    this.ui.setPlazaBodyState({ mode: true, hold: true, leaving: false });
    this.ui.openTab('tab-plaza', { quiet: true, instant: true });
    if (instant) canvas.style.transition = 'none';
    canvas.style.opacity = '';
    labelsEl.style.visibility = '';
    if (instant) requestAnimationFrame(() => { canvas.style.transition = ''; });
  }

  reopenPlaza() {
    if (this.plazaApi) return;
    setMusicScene(this.isParadeActive ? 'parade' : 'plaza');

    const restore = this.buildPlazaRestore();
    if (restore) {
      this.launchPlaza(true, restore);
      return;
    }
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