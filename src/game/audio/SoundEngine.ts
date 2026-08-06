/**
 * Procedural cockpit audio — Web Audio API only (no asset files).
 * Suit breathing, thruster rumble, cannon, and near-field explosions.
 */

const MASTER_GAIN = 0.55;
const STORAGE_KEY = "starship-gravity-audio";

export type AudioChannelSettings = {
  thrusterEnabled: boolean;
  thrusterVolume: number;
  cannonEnabled: boolean;
  cannonVolume: number;
  breathEnabled: boolean;
  breathVolume: number;
};

export const DEFAULT_AUDIO_SETTINGS: AudioChannelSettings = {
  thrusterEnabled: true,
  thrusterVolume: 0.85,
  cannonEnabled: true,
  cannonVolume: 0.9,
  breathEnabled: true,
  breathVolume: 0.85,
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function loadSettings(): AudioChannelSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioChannelSettings>;
    return {
      thrusterEnabled: parsed.thrusterEnabled ?? true,
      thrusterVolume: clamp01(parsed.thrusterVolume ?? 0.85),
      cannonEnabled: parsed.cannonEnabled ?? true,
      cannonVolume: clamp01(parsed.cannonVolume ?? 0.9),
      breathEnabled: parsed.breathEnabled ?? true,
      breathVolume: clamp01(parsed.breathVolume ?? 0.85),
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

function saveSettings(s: AudioChannelSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;

  settings: AudioChannelSettings = loadSettings();

  // Thruster / engine rumble (continuous)
  private thrusterGain: GainNode | null = null;
  private thrusterFilter: BiquadFilterNode | null = null;
  private thrusterNoise: AudioBufferSourceNode | null = null;
  private thrusterOsc: OscillatorNode | null = null;
  private thrusterOscGain: GainNode | null = null;
  private thrusterLevel = 0;
  private thrusterTarget = 0;

  // Suit breathing — continuous pink noise shaped by a breath LFO
  private breathBus: GainNode | null = null;
  private breathEnv: GainNode | null = null;
  private breathFilter: BiquadFilterNode | null = null;
  private breathHp: BiquadFilterNode | null = null;
  private breathNoise: AudioBufferSourceNode | null = null;
  private breathPhase = 0;
  private breathActive = false;
  private breathInterval = 2.6;
  private breathStress = 0;

  // Channel buses
  private cannonBus: GainNode | null = null;
  private fxBus: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private pinkBuffer: AudioBuffer | null = null;
  private started = false;

  getSettings(): AudioChannelSettings {
    return { ...this.settings };
  }

  setSettings(partial: Partial<AudioChannelSettings>) {
    this.settings = {
      ...this.settings,
      ...partial,
      thrusterVolume: clamp01(
        partial.thrusterVolume ?? this.settings.thrusterVolume,
      ),
      cannonVolume: clamp01(
        partial.cannonVolume ?? this.settings.cannonVolume,
      ),
      breathVolume: clamp01(
        partial.breathVolume ?? this.settings.breathVolume,
      ),
    };
    saveSettings(this.settings);
    this.applyBusGains();
  }

  private applyBusGains() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.cannonBus) {
      const v =
        this.settings.cannonEnabled && this.settings.cannonVolume > 0.001
          ? this.settings.cannonVolume
          : 0;
      this.cannonBus.gain.setTargetAtTime(v, t, 0.04);
    }
    if (this.fxBus) {
      this.fxBus.gain.setTargetAtTime(1, t, 0.04);
    }
    if (this.breathBus) {
      const open =
        this.breathActive &&
        this.settings.breathEnabled &&
        this.settings.breathVolume > 0.001;
      this.breathBus.gain.setTargetAtTime(open ? 1 : 0, t, 0.05);
    }
  }

  unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") {
      void this.ctx.resume().then(() => {
        if (this.unlocked) this.playBreathCue();
      });
    } else if (this.ctx?.state === "running") {
      this.playBreathCue();
    }
    this.unlocked = true;
  }

  private ensure() {
    if (this.ctx) return;
    if (typeof window === "undefined") return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(this.ctx.destination);

    this.cannonBus = this.ctx.createGain();
    this.cannonBus.gain.value = this.settings.cannonEnabled
      ? this.settings.cannonVolume
      : 0;
    this.cannonBus.connect(this.master);

    this.fxBus = this.ctx.createGain();
    this.fxBus.gain.value = 1;
    this.fxBus.connect(this.master);

    this.breathBus = this.ctx.createGain();
    this.breathBus.gain.value = 0;
    this.breathBus.connect(this.master);

    this.noiseBuffer = this.makeNoiseBuffer(2);
    this.pinkBuffer = this.makePinkBuffer(2);

    this.startThrusterGraph();
    this.startBreathGraph();
    this.started = true;
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /** Paul Kellet pink-noise approx — airy helmet breath body */
  private makePinkBuffer(seconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] =
        (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buf;
  }

  private startThrusterGraph() {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;

    this.thrusterGain = this.ctx.createGain();
    this.thrusterGain.gain.value = 0;
    this.thrusterGain.connect(this.master);

    this.thrusterFilter = this.ctx.createBiquadFilter();
    this.thrusterFilter.type = "lowpass";
    this.thrusterFilter.frequency.value = 220;
    this.thrusterFilter.Q.value = 0.7;
    this.thrusterFilter.connect(this.thrusterGain);

    this.thrusterNoise = this.ctx.createBufferSource();
    this.thrusterNoise.buffer = this.noiseBuffer;
    this.thrusterNoise.loop = true;
    this.thrusterNoise.connect(this.thrusterFilter);
    this.thrusterNoise.start();

    this.thrusterOscGain = this.ctx.createGain();
    this.thrusterOscGain.gain.value = 0;
    this.thrusterOscGain.connect(this.thrusterGain);

    this.thrusterOsc = this.ctx.createOscillator();
    this.thrusterOsc.type = "sawtooth";
    this.thrusterOsc.frequency.value = 48;
    this.thrusterOsc.connect(this.thrusterOscGain);
    this.thrusterOsc.start();
  }

  private startBreathGraph() {
    if (!this.ctx || !this.breathBus || !this.pinkBuffer) return;

    this.breathEnv = this.ctx.createGain();
    this.breathEnv.gain.value = 0;
    this.breathEnv.connect(this.breathBus);

    this.breathFilter = this.ctx.createBiquadFilter();
    this.breathFilter.type = "lowpass";
    this.breathFilter.frequency.value = 1200;
    this.breathFilter.Q.value = 0.55;
    this.breathFilter.connect(this.breathEnv);

    this.breathHp = this.ctx.createBiquadFilter();
    this.breathHp.type = "highpass";
    this.breathHp.frequency.value = 90;
    this.breathHp.Q.value = 0.5;
    this.breathHp.connect(this.breathFilter);

    this.breathNoise = this.ctx.createBufferSource();
    this.breathNoise.buffer = this.pinkBuffer;
    this.breathNoise.loop = true;
    this.breathNoise.connect(this.breathHp);
    this.breathNoise.start();
  }

  /** Short inhale cue when audio unlocks — proves the helmet mic is live */
  private playBreathCue() {
    if (!this.ctx || !this.breathBus || !this.pinkBuffer) return;
    if (!this.settings.breathEnabled || this.settings.breathVolume < 0.001)
      return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.pinkBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1500;
    const g = this.ctx.createGain();
    const peak = 0.62 * this.settings.breathVolume;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.breathBus);
    this.breathBus.gain.setValueAtTime(1, t);
    src.start(t);
    src.stop(t + 0.7);
  }

  update(
    dt: number,
    opts: {
      playing: boolean;
      thrust: number;
      reverse: number;
      level: number;
      safety: number;
      claudeIntensity: number;
    },
  ) {
    if (!this.unlocked) return;
    this.ensure();
    if (!this.ctx || !this.started) return;
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
      return;
    }

    const engine = Math.max(opts.thrust, opts.reverse * 0.75);
    const thrusterOn =
      this.settings.thrusterEnabled && this.settings.thrusterVolume > 0.001;
    this.thrusterTarget = opts.playing && thrusterOn ? engine : 0;
    const k = 1 - Math.exp(-10 * dt);
    this.thrusterLevel += (this.thrusterTarget - this.thrusterLevel) * k;
    this.applyThruster(
      this.thrusterLevel * this.settings.thrusterVolume,
      opts.reverse > opts.thrust,
    );

    this.breathActive =
      opts.playing &&
      this.settings.breathEnabled &&
      this.settings.breathVolume > 0.001;
    const safetyStress = Math.max(0, (55 - opts.safety) / 55);
    this.breathStress = Math.min(
      1,
      safetyStress * 0.65 + opts.claudeIntensity * 0.45,
    );
    const baseInterval = Math.max(1.1, 2.7 - (opts.level - 1) * 0.12);
    this.breathInterval = Math.max(
      0.85,
      baseInterval * (1 - this.breathStress * 0.45),
    );

    this.applyBreath(dt);
  }

  private applyBreath(dt: number) {
    if (!this.ctx || !this.breathBus || !this.breathEnv || !this.breathFilter)
      return;
    const t = this.ctx.currentTime;

    if (!this.breathActive) {
      this.breathBus.gain.setTargetAtTime(0, t, 0.1);
      this.breathEnv.gain.setTargetAtTime(0, t, 0.08);
      return;
    }

    this.breathBus.gain.setTargetAtTime(1, t, 0.05);

    this.breathPhase =
      (this.breathPhase + dt / Math.max(0.4, this.breathInterval)) % 1;
    const p = this.breathPhase;
    const stress = this.breathStress;

    let shape = 0;
    if (p < 0.42) {
      shape = Math.sin((p / 0.42) * Math.PI);
    } else if (p < 0.5) {
      shape = 0.12;
    } else {
      shape = Math.sin(((p - 0.5) / 0.5) * Math.PI) * 0.82;
    }

    const peak =
      (0.48 + stress * 0.3) * Math.max(0.25, this.settings.breathVolume);
    const level = peak * shape;

    this.breathEnv.gain.setTargetAtTime(Math.max(0.0001, level), t, 0.03);
    const cutoff = 700 + shape * 1100 + stress * 350;
    this.breathFilter.frequency.setTargetAtTime(cutoff, t, 0.04);
  }

  private applyThruster(level: number, reverse: boolean) {
    if (!this.ctx || !this.thrusterGain || !this.thrusterFilter) return;
    const t = this.ctx.currentTime;
    const vol = level * (reverse ? 0.18 : 0.26);
    this.thrusterGain.gain.setTargetAtTime(vol, t, 0.04);
    this.thrusterFilter.frequency.setTargetAtTime(
      reverse ? 160 + level * 80 : 200 + level * 280,
      t,
      0.05,
    );
    if (this.thrusterOsc && this.thrusterOscGain) {
      this.thrusterOsc.frequency.setTargetAtTime(
        reverse ? 42 : 48 + level * 18,
        t,
        0.05,
      );
      this.thrusterOscGain.gain.setTargetAtTime(level * 0.07, t, 0.05);
    }
  }

  playShot() {
    if (!this.unlocked) return;
    if (!this.settings.cannonEnabled || this.settings.cannonVolume < 0.001)
      return;
    this.ensure();
    if (!this.ctx || !this.cannonBus || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const v = this.settings.cannonVolume;

    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const nf = this.ctx.createBiquadFilter();
    nf.type = "highpass";
    nf.frequency.value = 1200;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.28 * v, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(this.cannonBus);
    n.start(t);
    n.stop(t + 0.07);

    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.09);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.12 * v, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(og);
    og.connect(this.cannonBus);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  playExplosion(distance: number, hearRadius: number): boolean {
    if (!this.unlocked) return false;
    this.ensure();
    if (!this.ctx || !this.fxBus || !this.noiseBuffer) return false;
    if (distance >= hearRadius) return false;

    const proximity = 1 - distance / hearRadius;
    const vol = 0.12 + proximity * 0.55;
    const t = this.ctx.currentTime;

    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const lf = this.ctx.createBiquadFilter();
    lf.type = "lowpass";
    lf.frequency.setValueAtTime(900 + proximity * 600, t);
    lf.frequency.exponentialRampToValueAtTime(80, t + 0.35);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(vol, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4 + proximity * 0.25);
    n.connect(lf);
    lf.connect(ng);
    ng.connect(this.fxBus);
    n.start(t);
    n.stop(t + 0.7);

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90 + proximity * 40, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.28);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(vol * 0.55, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(og);
    og.connect(this.fxBus);
    osc.start(t);
    osc.stop(t + 0.4);

    return true;
  }

  playHullTick() {
    if (!this.unlocked) return;
    this.ensure();
    if (!this.ctx || !this.fxBus) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(g);
    g.connect(this.fxBus);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  dispose() {
    try {
      this.thrusterNoise?.stop();
      this.thrusterOsc?.stop();
      this.breathNoise?.stop();
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.started = false;
    this.unlocked = false;
  }
}
