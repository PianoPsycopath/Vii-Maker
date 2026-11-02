const PLAZA_NODES = '#plazaCv, #plazaLabels, #plazaHint';
const PLAZA_BODY_CLASSES = ['plaza-mode', 'plaza-hold', 'plaza-leaving', 'plaza-gust'];
const INTRO_EXIT_MS = 1600;

function createPlazaNodes() {
  const canvas = document.createElement('canvas');
  canvas.id = 'plazaCv';
  canvas.setAttribute('aria-label', 'Villager plaza. Pick a villager to edit.');

  const labels = document.createElement('div');
  labels.id = 'plazaLabels';

  const hint = document.createElement('div');
  hint.id = 'plazaHint';
  hint.innerHTML = '<strong>Villager Plaza</strong><span>Pick a villager to edit</span>';

  return [canvas, labels, hint];
}

export class PlazaView {
  constructor({ body, stage, introScreen }) {
    this.body = body;
    this.stage = stage;
    this.introScreen = introScreen;
  }

  prepare(freshLoad = false) {
    if (freshLoad) this.removeNodes();
    if (!document.querySelector('#plazaCv')) this.body.prepend(...createPlazaNodes());

    const canvas = document.querySelector('#plazaCv');
    if (freshLoad) canvas.style.opacity = '0';

    return {
      canvas,
      labelsEl: document.querySelector('#plazaLabels'),
      hintEl: document.querySelector('#plazaHint'),
      stageEl: this.stage
    };
  }

  clear() {
    this.removeNodes();
    this.body.classList.remove(...PLAZA_BODY_CLASSES);
  }

  setBodyState({ mode, hold, leaving, gust }) {
    const { classList } = this.body;
    if (mode !== undefined) classList.toggle('plaza-mode', mode);
    if (hold !== undefined) classList.toggle('plaza-hold', hold);
    if (leaving !== undefined) classList.toggle('plaza-leaving', leaving);
    if (gust !== undefined) classList.toggle('plaza-gust', gust);
  }

  setupIntro(onStart) {
    const { introScreen } = this;
    if (!introScreen) return;

    let begun = false;
    const begin = async () => {
      if (begun) return;
      begun = true;
      introScreen.classList.add('leaving');
      setTimeout(() => introScreen.remove(), INTRO_EXIT_MS);
      await onStart();
    };

    introScreen.addEventListener('click', begin);
    introScreen.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      begin();
    });
    introScreen.focus();
  }

  markIntroReady() {
    this.introScreen?.classList.add('ready');
  }

  removeNodes() {
    document.querySelectorAll(PLAZA_NODES).forEach(node => node.remove());
  }
}