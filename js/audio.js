import { clamp } from "./utils.js";

const SOUND_FILES = {
  music: "../assets/sounds/music.mp3",
  button: "../assets/sounds/button.wav",
  cast: "../assets/sounds/cast.wav",
  bite: "../assets/sounds/bite.wav",
  reel: "../assets/sounds/reel.wav",
  catch: "../assets/sounds/catch.wav",
  fail: "../assets/sounds/fail.wav",
};

export class AudioManager {
  constructor() {
    this.muted = false;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.buffers = new Map();
    this.musicNode = null;
    this._musicPlaying = false;
    this._unlocked = false;
  }

  async init() {
    // Safe to call multiple times.
    if (this._initStarted) return;
    this._initStarted = true;

    // Preload is best-effort; game must work even if it fails.
    try {
      await this._ensureContext();
      await Promise.all(
        Object.entries(SOUND_FILES).map(async ([name, url]) => {
          if (name === "music") return;
          const buf = await this._loadAudioBuffer(url);
          if (buf) this.buffers.set(name, buf);
        }),
      );
    } catch {
      // ignore
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  async unlock() {
    try {
      await this._ensureContext();
      if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
      this._unlocked = true;
    } catch {
      // ignore
    }
  }

  async playMusic() {
    if (this._musicPlaying) return;
    this._musicPlaying = true;
    try {
      await this._ensureContext();
      if (!this.ctx) return;
      if (this.musicNode) this.stopMusic();

      // Best-effort asset playback; if missing, use synth bed.
      const musicBuf = await this._loadAudioBuffer(SOUND_FILES.music);
      if (musicBuf) {
        const src = this.ctx.createBufferSource();
        src.buffer = musicBuf;
        src.loop = true;
        src.connect(this.musicGain);
        src.start();
        this.musicNode = src;
        return;
      }

      this.musicNode = this._startSynthMusic();
    } catch {
      // ignore
    }
  }

  stopMusic() {
    this._musicPlaying = false;
    if (!this.ctx) return;
    try {
      if (this.musicNode && typeof this.musicNode.stop === "function") this.musicNode.stop();
    } catch {
      // ignore
    }
    try {
      if (this.musicNode && typeof this.musicNode.disconnect === "function") this.musicNode.disconnect();
    } catch {
      // ignore
    }
    this.musicNode = null;
  }

  async playSfx(name, opts = {}) {
    if (this.muted) return;
    try {
      await this._ensureContext();
      if (!this.ctx) return;
      const buf = this.buffers.get(name);
      if (buf) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.value = clamp(opts.volume ?? 0.9, 0, 1.25);
        src.connect(g);
        g.connect(this.sfxGain);
        src.start();
        return;
      }
      this._playSynthSfx(name);
    } catch {
      // ignore
    }
  }

  async _ensureContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();

    this.musicGain.gain.value = 0.32;
    this.sfxGain.gain.value = 0.95;
    this.master.gain.value = this.muted ? 0 : 1;

    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  async _loadAudioBuffer(url) {
    if (!this.ctx) return null;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(arr);
    } catch {
      return null;
    }
  }

  _playSynthSfx(name) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();

    f.type = "lowpass";
    f.frequency.value = 1600;

    let type = "triangle";
    let freq = 440;
    let dur = 0.16;
    let vol = 0.42;

    if (name === "button") {
      type = "square";
      freq = 520;
      dur = 0.06;
      vol = 0.2;
    } else if (name === "cast") {
      type = "sawtooth";
      freq = 180;
      dur = 0.18;
      vol = 0.32;
      f.frequency.value = 900;
    } else if (name === "bite") {
      type = "square";
      freq = 720;
      dur = 0.1;
      vol = 0.28;
      f.frequency.value = 1400;
    } else if (name === "reel") {
      type = "triangle";
      freq = 240;
      dur = 0.12;
      vol = 0.18;
      f.frequency.value = 800;
    } else if (name === "catch") {
      type = "triangle";
      freq = 880;
      dur = 0.22;
      vol = 0.35;
      f.frequency.value = 1800;
    } else if (name === "fail") {
      type = "sawtooth";
      freq = 140;
      dur = 0.26;
      vol = 0.38;
      f.frequency.value = 600;
    }

    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.75), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  _startSynthMusic() {
    if (!this.ctx) return null;
    const t0 = this.ctx.currentTime;
    const master = this.ctx.createGain();
    master.gain.value = 0.75;
    master.connect(this.musicGain);

    // Two oscillators + slow filter for a calm pond vibe.
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();

    o1.type = "triangle";
    o2.type = "sine";
    f.type = "lowpass";
    f.frequency.value = 700;

    lfo.type = "sine";
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 220;

    lfo.connect(lfoGain);
    lfoGain.connect(f.frequency);

    o1.connect(f);
    o2.connect(f);
    f.connect(master);

    const prog = [
      [196.0, 293.66], // G3 + D4
      [220.0, 329.63], // A3 + E4
      [174.61, 261.63], // F3 + C4
      [196.0, 293.66], // G3 + D4
    ];

    const step = 2.0;
    for (let i = 0; i < prog.length; i++) {
      const t = t0 + i * step;
      const [a, b] = prog[i];
      o1.frequency.setValueAtTime(a, t);
      o2.frequency.setValueAtTime(b, t);
    }

    o1.start();
    o2.start();
    lfo.start();

    // Re-schedule indefinitely with a timer (simple, robust).
    const loopSeconds = prog.length * step;
    const id = setInterval(() => {
      if (!this.ctx || !this._musicPlaying) return;
      const t = this.ctx.currentTime;
      for (let i = 0; i < prog.length; i++) {
        const tt = t + i * step;
        const [a, b] = prog[i];
        o1.frequency.setValueAtTime(a, tt);
        o2.frequency.setValueAtTime(b, tt);
      }
    }, Math.floor(loopSeconds * 1000 * 0.9));

    const stopper = {
      stop: () => {
        clearInterval(id);
        try {
          o1.stop();
          o2.stop();
          lfo.stop();
        } catch {
          // ignore
        }
      },
      disconnect: () => {
        try {
          master.disconnect();
        } catch {
          // ignore
        }
      },
    };
    return stopper;
  }
}

