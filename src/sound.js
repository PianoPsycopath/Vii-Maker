class AudioEngine {
  constructor() {
    this.context = null;
    this.isMuted = false;
  }

  getContext() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) this.context = new AudioContextClass();
    }
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
    return this.context;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (!this.isMuted) this.getContext();
    return this.isMuted;
  }
}

const engine = new AudioEngine();

export const MUSIC_FILES = {
  intro:  'data/music/intro.mp3',
  plaza:  'data/music/plaza.mp3',
  parade: 'data/music/parade.mp3',
  edit:   'data/music/edit.mp3'
};

class MusicController {
  constructor() {
    this.buffers = {};
    this.mix = {};
    this.masterGain = null;
    this.activeScene = 'plaza';
    this.isEnabled = true;
    this.clock = null;
    this.isReady = null;
    
    this.VOL_MASTER = 0.35;
    this.VOL_INTRO = 0.6;
    this.CROSSFADE_DUR = 0.3;
    this.STEMS = ['plaza', 'parade', 'edit'];
  }

  load() {
    if (!this.isReady) {
      const ctx = engine.getContext();
      this.isReady = Promise.all(Object.entries(MUSIC_FILES).map(async ([key, url]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          this.buffers[key] = await ctx.decodeAudioData(await response.arrayBuffer());
        } catch (error) {
          console.warn(`Music file missing or invalid: ${url}`, error);
          this.buffers[key] = null;
        }
      })).then(() => this.buffers);
    }
    return this.isReady;
  }

  setupMixer(ctx) {
    if (this.masterGain) return;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.isEnabled ? this.VOL_MASTER : 0;
    this.masterGain.connect(ctx.destination);

    for (const stem of this.STEMS) {
      this.mix[stem] = ctx.createGain();
      this.mix[stem].gain.value = 0;
      this.mix[stem].connect(this.masterGain);
    }
  }

  applyScene(instant) {
    if (!this.masterGain) return;
    const ctx = engine.getContext();
    const currentStem = this.buffers[this.activeScene] ? this.activeScene : 'plaza';

    for (const stem of this.STEMS) {
      const gainNode = this.mix[stem].gain;
      const target = stem === currentStem ? 1 : 0;
      
      gainNode.cancelScheduledValues(ctx.currentTime);
      gainNode.setValueAtTime(instant ? target : gainNode.value, ctx.currentTime);
      
      if (!instant) {
        gainNode.setTargetAtTime(target, ctx.currentTime, this.CROSSFADE_DUR);
      }
    }
  }

  async playIntro() {
    const ctx = engine.getContext();
    await this.load();
    if (!this.buffers.intro) return;
    
    await ctx.resume();
    return new Promise(resolve => {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      
      src.buffer = this.buffers.intro;
      gain.gain.value = this.isEnabled ? this.VOL_INTRO : 0;
      
      src.connect(gain);
      gain.connect(ctx.destination);
      src.onended = resolve;
      src.start();
    });
  }

  async startGrid() {
    await this.load();
    if (this.clock) return true;
    if (!this.buffers.plaza) {
      console.warn('Plaza master track missing; music grid cannot start.');
      return false;
    }

    const ctx = engine.getContext();
    await ctx.resume();
    this.setupMixer(ctx);

    const period = this.buffers.plaza.duration / 2;
    const startTime = ctx.currentTime + 0.15;
    
    const masterLoop = ctx.createBufferSource();
    masterLoop.buffer = this.buffers.plaza;
    masterLoop.loop = true;
    masterLoop.connect(this.mix.plaza);
    masterLoop.start(startTime);

    this.clock = { startTime, period, iter: 0 };
    this.applyScene(true);

    const tick = () => {
      while (this.clock.startTime + this.clock.iter * this.clock.period < ctx.currentTime + this.clock.period * 1.5 + 1) {
        const schedTime = this.clock.startTime + this.clock.iter * this.clock.period;
        ['parade', 'edit'].forEach(stem => {
          if (!this.buffers[stem]) return;
          const src = ctx.createBufferSource();
          src.buffer = this.buffers[stem];
          src.connect(this.mix[stem]);
          src.start(schedTime, 0, this.clock.period);
        });
        this.clock.iter++;
      }
    };

    tick();
    setInterval(tick, 1000);
    return true;
  }
}

const music = new MusicController();

class SynthFX {
  constructor() {
    this.lastHoverTime = 0;
  }

  _playNote(type, freqStart, gainVol, dur, freqEnd = null, freqMid = null) {
    if (engine.isMuted) return;
    const ctx = engine.getContext();
    if (!ctx) return;
    
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    
    if (freqMid) osc.frequency.linearRampToValueAtTime(freqMid.val, t + freqMid.time);
    if (freqEnd) osc.frequency[freqEnd.type === 'exp' ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime'](freqEnd.val, t + freqEnd.time);

    gain.gain.setValueAtTime(gainVol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  hover() {
    const now = performance.now();
    if (now - this.lastHoverTime < 45) return;
    this.lastHoverTime = now;
    this._playNote('sine', 740, 0.06, 0.04, { val: 620, time: 0.04, type: 'exp' });
  }

  select() {
    this._playNote('triangle', 880, 0.14, 0.08);
    this._playNote('triangle', 1320, 0.10, 0.12);
  }

  tab() {
    this._playNote('sine', 420, 0.12, 0.09, { val: 820, time: 0.08, type: 'exp' });
  }

  toggle() {
    this._playNote('sine', 520, 0.12, 0.08, { val: 660, time: 0.08, type: 'lin' }, { val: 980, time: 0.04 });
  }

  random() {
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      setTimeout(() => this._playNote('triangle', freq, 0.13, 0.09), idx * 45);
    });
  }

  save() {
    [783.99, 987.77, 1174.66, 1567.98].forEach((freq, idx) => {
      setTimeout(() => this._playNote('sine', freq, 0.12, 0.45), idx * 35);
    });
  }
}

const sfx = new SynthFX();

export const VILLAGER_SFX = {
  idle: [1, 2, 3].map(n => `data/sfx/Villager_idle${n}.ogg`),
  accept: [1, 2, 3].map(n => `data/sfx/Villager_accept${n}.ogg`)
};

class VoiceController {
  constructor() {
    this.buffers = { idle: [], accept: [] };
    this.lastIndex = { idle: -1, accept: -1 };
    this.lastPlay = { idle: 0, accept: 0 };
    this.isReady = null;

    this.VOL_BASE = 0.6;
    this.CHANCE_ACCEPT = 0.3;
    this.GAP_IDLE = 1200;
    this.GAP_ACCEPT = 500;
    this.PITCH_JITTER = 0.06;
  }

  load() {
    const ctx = engine.getContext();
    if (!ctx) return Promise.resolve(this.buffers);
    
    if (!this.isReady) {
      this.isReady = Promise.all(
        Object.entries(VILLAGER_SFX).flatMap(([type, urls]) => 
          urls.map(async (url, i) => {
            try {
              const res = await fetch(url);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              this.buffers[type][i] = await ctx.decodeAudioData(await res.arrayBuffer());
            } catch (err) {
              console.warn(`Voice file missing: ${url}`, err);
              this.buffers[type][i] = null;
            }
          })
        )
      ).then(() => this.buffers);
    }
    return this.isReady;
  }

  _canPlay() {
    if (engine.isMuted || !engine.context || engine.context.state !== 'running') return false;
    this.load();
    return true;
  }

  _play(type, gapLimit, opts = {}) {
    if (!this._canPlay()) return false;
    const now = performance.now();
    if (now - this.lastPlay[type] < gapLimit) return false;

    const available = this.buffers[type].map((b, i) => b ? i : -1).filter(i => i >= 0);
    if (!available.length) return false;

    const pool = available.length > 1 ? available.filter(i => i !== this.lastIndex[type]) : available;
    const selection = pool[Math.floor(Math.random() * pool.length)];
    
    this.lastIndex[type] = selection;
    this.lastPlay[type] = now;

    const ctx = engine.getContext();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    
    src.buffer = this.buffers[type][selection];
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * this.PITCH_JITTER;
    gain.gain.value = this.VOL_BASE * (opts.vol ?? 1);
    
    src.connect(gain);
    
    if (opts.pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      gain.connect(ctx.destination);
    }
    
    src.start();
    return true;
  }

  idle(pan = 0, vol = 1) {
    return this._play('idle', this.GAP_IDLE, { pan, vol });
  }

  accept(chance = this.CHANCE_ACCEPT) {
    if (Math.random() >= chance) return false;
    return this._play('accept', this.GAP_ACCEPT);
  }
}

const voice = new VoiceController();

export const isMuted = () => engine.isMuted;
export const toggleMute = () => {
  const muted = engine.toggleMute();
  if (!muted) playSelect();
  return muted;
};

export const loadMusic = () => music.load();
export const setMusicScene = (name) => {
  if (music.STEMS.includes(name) && name !== music.activeScene) {
    music.activeScene = name;
    music.applyScene(false);
  }
};
export const setMusicEnabled = (on) => {
  music.isEnabled = !!on;
  if (music.masterGain) {
    const ctx = engine.getContext();
    music.masterGain.gain.cancelScheduledValues(ctx.currentTime);
    music.masterGain.gain.setTargetAtTime(music.isEnabled ? music.VOL_MASTER : 0, ctx.currentTime, 0.05);
  }
};
export const isMusicEnabled = () => music.isEnabled;
export const isMusicRunning = () => !!music.clock;
export const playIntro = () => music.playIntro();
export const startMusic = () => music.startGrid();

export const playHover = () => sfx.hover();
export const playSelect = () => sfx.select();
export const playTab = () => sfx.tab();
export const playToggle = () => sfx.toggle();
export const playRandom = () => sfx.random();
export const playSave = () => sfx.save();

export const loadSfx = () => voice.load();
export const playVillagerIdle = (config) => voice.idle(config?.pan, config?.vol);
export const playVillagerAccept = (chance) => voice.accept(chance);