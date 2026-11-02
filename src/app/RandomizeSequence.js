import { PlazaScene } from '../plaza/index.js';
import { playVillagerAccept, setMusicScene } from '../sound.js';
import { rollRandomLook } from './randomLook.js';
import { afterFrames, delay } from './timing.js';

const GUST_BODY = { mode: true, hold: true, leaving: false, gust: true };
const IDLE_BODY = { mode: false, hold: false, leaving: false, gust: false };
const MIN_RATTLE_MS = 500;
const SETTLE_PAUSE_MS = 500;
const FADE_MS = 500;
const ACTOR_COUNT = 10;
const MISSING_GUST_MESSAGE =
  'gust.png was not found (looked in img/, img/icons/, img/fx/, data/ and the site root), so the gust was skipped.';

export class RandomizeSequence {
  constructor({ ui, state, appData, lookups, plaza, onRandomizeCurrent }) {
    this.ui = ui;
    this.state = state;
    this.appData = appData;
    this.lookups = lookups;
    this.plaza = plaza;
    this.onRandomizeCurrent = onRandomizeCurrent;
    this.running = false;
  }

  async run() {
    if (this.running || this.plaza.isOpen) return;
    this.running = true;

    const launch = this.ui.beginDiceLaunch();
    const featured = this.featuredName();

    try {
      const scene = await this.openScene(launch, featured);

      if (scene) await this.rollInScene(scene, launch, featured);
      else this.onRandomizeCurrent();

      playVillagerAccept(1);
      await delay(SETTLE_PAUSE_MS);
      await this.closeScene(scene);
    } finally {
      launch.restore();
      setMusicScene('edit');
      this.ui.setPlazaBodyState(IDLE_BODY);
      this.running = false;
    }
  }

  featuredName() {
    const { name } = this.state.current;
    return name && this.state.lookup(name) ? name : null;
  }

  async openScene(launch, featured) {
    try {
      this.ui.setPlazaBodyState(GUST_BODY);
      setMusicScene('plaza');

      const scene = await this.createScene(featured);
      if (!scene) throw new Error('there are no villagers to show');

      await afterFrames();
      scene.canvas.style.opacity = '';
      await Promise.all([launch.rattled, delay(MIN_RATTLE_MS)]);
      return scene;
    } catch (error) {
      console.error('Randomize plaza failed', error);
      this.ui.clearPlazaDOM();
      this.ui.setStatus(`Randomize could not open the plaza: ${error.message}`);
      return null;
    }
  }

  async createScene(featured) {
    const names = this.state.getAllNames().filter(name => this.state.lookup(name));
    if (!names.length) return null;

    const lookup = name => {
      const record = this.state.lookup(name);
      return name === featured && record ? { ...record, ...this.state.getRecord() } : record;
    };

    const elements = this.ui.preparePlazaDOM(true);
    const scene = new PlazaScene({
      ...elements,
      GEO: this.appData.GEO,
      M: this.appData.M,
      lookups: this.lookups,
      names,
      lookup,
      featured,
      count: ACTOR_COUNT,
      parade: false,
      interactive: false
    });
    await scene.initialize();
    elements.hintEl.remove();
    return scene;
  }

  async rollInScene(scene, launch, featured) {
    let swap = null;

    const reroll = scene
      .prepareReroll((name, record) => rollRandomLook(record.k), featured)
      .catch(error => console.error('Could not prepare the new looks', error));

    const rolled = scene.dropDice(launch.screen);
    await afterFrames();
    launch.release();
    await rolled;
    await reroll;

    await scene.playGust({
      onPeak: () => {
        scene.applyReroll();
        this.onRandomizeCurrent();
        if (featured) swap = scene.refreshActor(featured);
      }
    });

    if (swap) await swap;
    if (scene.gustMissing) this.ui.setStatus(MISSING_GUST_MESSAGE);
  }

  async closeScene(scene) {
    if (scene) {
      scene.canvas.style.opacity = '0';
      scene.labelsContainer.style.transition = 'opacity .4s ease';
      scene.labelsContainer.style.opacity = '0';
    }

    this.ui.setPlazaBodyState(IDLE_BODY);
    if (!scene) return;

    await delay(FADE_MS);
    scene.dispose();
  }
}