/**
 * Procedural cockpit audio — Web Audio API only (no asset files).
 * Suit breathing, thruster rumble, cannon, and near-field explosions.
 */

const MASTER_GAIN = 0.42;
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
  breathVolume: 0.75,
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
      breathVolume: clamp01(parsed.breathVolume ?? 0.75),
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

  // Suit breathing (looped schedule)
  private breathGain: GainNode | null = null;
  private breathNextAt = 0;
  private breathActive = false;
  private breathInterval = 3.2;
  private breathStress = 0;

  // Channel buses
  private cannonBus: GainNode | null = null;
  private fxBus: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
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
  }

  unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") {
      void this.ctx.resume();
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

    this.breathGain = this.ctx.createGain();
    this.breathGain.gain.value = 0;
    this.breathGain.connect(this.master);

    this.noiseBuffer = this.makeNoiseBuffer(2);

    this.startThrusterGraph();
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
    if (this.ctx.state === "suspended") return;

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
    const baseInterval = Math.max(1.05, 3.4 - (opts.level - 1) * 0.18);
    this.breathInterval = Math.max(
      0.75,
      baseInterval * (1 - this.breathStress * 0.42),
    );

    if (this.breathActive) {
      this.scheduleBreaths();
    } else if (this.breathGain) {
      this.breathGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  private applyThruster(level: number, reverse: boolean) {
    if (!this.ctx || !this.thrusterGain || !this.thrusterFilter) return;
    const t = this.ctx.currentTime;
    const vol = level * (reverse ? 0.22 : 0.32);
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
      this.thrusterOscGain.gain.setTargetAtTime(level * 0.08, t, 0.05);
    }
  }

  private scheduleBreaths() {
    if (!this.ctx || !this.breathGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    if (this.breathNextAt < now) this.breathNextAt = now + 0.05;

    while (this.breathNextAt < now + 1.2) {
      this.playOneBreath(this.breathNextAt);
      this.breathNextAt += this.breathInterval;
    }
  }

  private playOneBreath(when: number) {
    if (!this.ctx || !this.breathGain || !this.noiseBuffer) return;

    const stress = this.breathStress;
    const inhaleDur = 0.45 + stress * 0.12;
    const exhaleDur = 0.55 + stress * 0.15;
    const peak =
      (0.07 + stress * 0.08) * this.settings.breathVolume;

    this.noiseBurst({
      when,
      duration: inhaleDur,
      filterFreq: 900 + stress * 400,
      filterQ: 0.9,
      peakGain: peak,
      attack: 0.08,
      release: 0.18,
      dest: this.breathGain,
    });
    this.noiseBurst({
      when: when + inhaleDur * 0.85,
      duration: exhaleDur,
      filterFreq: 420 + stress * 120,
      filterQ: 0.6,
      peakGain: peak * 0.7,
      attack: 0.1,
      release: 0.28,
      dest: this.breathGain,
    });
  }

  private noiseBurst(opts: {
    when: number;
    duration: number;
    filterFreq: number;
    filterQ: number;
    peakGain: number;
    attack: number;
    release: number;
    dest: AudioNode;
  }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = opts.filterFreq;
    filter.Q.value = opts.filterQ;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, opts.when);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, opts.peakGain),
      opts.when + opts.attack,
    );
    g.gain.exponentialRampToValueAtTime(
      0.0001,
      opts.when + opts.duration + opts.release,
    );

    src.connect(filter);
    filter.connect(g);
    g.connect(opts.dest);
    src.start(opts.when);
    src.stop(opts.when + opts.duration + opts.release + 0.05);
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
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.started = false;
    this.unlocked = false;
  }
}
