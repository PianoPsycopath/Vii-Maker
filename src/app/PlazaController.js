import { PlazaScene } from '../plaza/index.js';
import { playSelect, playTab, setMusicScene } from '../sound.js';
import { afterFrames } from './timing.js';

const PLAZA_TAB = 'tab-plaza';
const ACTOR_COUNT = 10;
const PLAZA_SHOWN = { mode: true, hold: true, leaving: false };
const PLAZA_HIDDEN = { mode: false, hold: false, leaving: false };

export class PlazaController {
  constructor({ state, appData, lookups, ui, selectVillager }) {
    this.state = state;
    this.appData = appData;
    this.lookups = lookups;
    this.ui = ui;
    this.selectVillager = selectVillager;

    this.scene = null;
    this.roster = null;
    this.paradeActive = false;
  }

  get isOpen() {
    return this.scene !== null;
  }

  launch(freshLoad = false, restore = null) {
    const names = this.villagerNames();
    if (!names.length) {
      this.ui.setPlazaBodyState(PLAZA_HIDDEN);
      return;
    }

    const elements = this.ui.preparePlazaDOM(freshLoad);

    try {
      const scene = this.createScene(elements, names, restore);
      this.scene = scene;
      const ready = scene.initialize();

      if (restore) this.revealWhenReady(scene, ready, elements, restore);
      else if (freshLoad) afterFrames().then(() => { elements.canvas.style.opacity = ''; });
    } catch (error) {
      console.warn('Plaza failed, opening the editor instead', error);
      this.scene = null;
      this.ui.clearPlazaDOM();
    }
  }

  reopen() {
    if (this.scene) return;
    setMusicScene(this.musicScene());

    const restore = this.buildRestore();
    if (restore) {
      this.launch(true, restore);
      return;
    }

    this.ui.openTab(PLAZA_TAB, { quiet: true, instant: true });
    this.ui.setPlazaBodyState(PLAZA_SHOWN);
    this.launch(true);
  }

  toggleParade() {
    this.paradeActive = !this.paradeActive;
    this.scene?.setParade(this.paradeActive);
    setMusicScene(this.musicScene());
    return this.paradeActive;
  }

  musicScene() {
    return this.paradeActive ? 'parade' : 'plaza';
  }

  villagerNames() {
    return this.state.getAllNames().filter(name => this.state.lookup(name));
  }

  createScene(elements, names, restore) {
    return new PlazaScene({
      ...elements,
      GEO: this.appData.GEO,
      M: this.appData.M,
      lookups: this.lookups,
      names: restore ? restore.names : names,
      lookup: restore ? restore.lookup : this.state.lookup.bind(this.state),
      restore: restore ? restore.scene : null,
      count: ACTOR_COUNT,
      parade: this.paradeActive,
      onPick: (name, lookConfig, roster) => this.handlePick(name, lookConfig, roster),
      onReveal: () => {
        this.ui.setPlazaBodyState({ mode: false, leaving: false });
        playTab();
      },
      onHandoff: () => {
        this.scene = null;
        this.ui.setPlazaBodyState({ hold: false });
      }
    });
  }

  handlePick(name, lookConfig, roster) {
    this.roster = roster;
    playSelect();
    setMusicScene('edit');
    this.ui.setPlazaBodyState({ leaving: true });

    Object.assign(this.state.previewConfig, lookConfig);
    this.state.isShiftSimulated = true;
    this.ui.setShiftSimChecked(true);

    this.ui.syncPreviewConfig(this.state.previewConfig);
    this.selectVillager(name);
    this.ui.openTab(PLAZA_TAB, { quiet: true, instant: true });
  }

  revealWhenReady(scene, ready, elements, restore) {
    elements.labelsEl.style.visibility = 'hidden';

    ready
      .then(() => afterFrames())
      .then(() => {
        if (this.scene === scene && !scene.isDisposed) {
          this.revealRestored(elements, !!restore.scene.featured);
        }
      })
      .catch(error => this.recoverFromFailedRestore(scene, error));
  }

  recoverFromFailedRestore(scene, error) {
    console.warn('Could not restore the plaza, starting a fresh one', error);
    try {
      scene.dispose();
    } catch {}
    if (this.scene === scene) this.scene = null;
    this.roster = null;
    this.ui.setPlazaBodyState(PLAZA_SHOWN);
    this.launch(true);
  }

  revealRestored({ canvas, labelsEl }, instant) {
    this.ui.setPlazaBodyState(PLAZA_SHOWN);
    this.ui.openTab(PLAZA_TAB, { quiet: true, instant: true });
    if (instant) canvas.style.transition = 'none';
    canvas.style.opacity = '';
    labelsEl.style.visibility = '';
    if (instant) requestAnimationFrame(() => { canvas.style.transition = ''; });
  }

  buildRestore() {
    if (!this.roster?.length) return null;

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
        roster: this.roster,
        featured: name ? { name, previewConfig: { ...previewConfig }, simShift: isShiftSimulated } : null,
        stageRect: { left: stage.left, top: stage.top, width: stage.width, height: stage.height }
      }
    };
  }
}