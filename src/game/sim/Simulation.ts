import {
  ASTEROID,
  AUDIO,
  CLAUDE,
  FIXED_DT,
  SHIP,
  WORLD_HALF,
  asteroidsForLevel,
  damageFromAsteroid,
  maxClaudesForLevel,
  safetyConversionRate,
} from "../constants";
import { SoundEngine } from "../audio/SoundEngine";
import type {
  AsteroidSize,
  AsteroidState,
  BulletState,
  ClaudeEffect,
  ClaudeIntent,
  ClaudeState,
  GameMode,
  InputActions,
  Particle,
  ShipState,
  ToastMsg,
  UiSnapshot,
} from "../types";
import {
  bounceBodies,
  clamp,
  clampSpeed,
  forwardFromYaw,
  gravityAccelFrom,
  randRange,
  randomEdgePoint,
  ricochetFromImpulse,
  wrap,
  wrapDelta,
} from "./math";
import { InputManager } from "./input";

const CLAUDE_EFFECTS: ClaudeEffect[] = [
  "gravity_invert",
  "gravity_amp",
  "drag_field",
  "thrust_warp",
  "bullet_slow",
  "lateral_nudge",
];

const CONTRADICTORY_EFFECTS: ReadonlyArray<readonly [ClaudeEffect, ClaudeEffect]> =
  [
    ["gravity_invert", "gravity_amp"],
  ];

function effectsContradict(a: ClaudeEffect, b: ClaudeEffect): boolean {
  if (a === b) return false;
  for (const [x, y] of CONTRADICTORY_EFFECTS) {
    if ((a === x && b === y) || (a === y && b === x)) return true;
  }
  return false;
}

const CLAUDE_INTENTS: ClaudeIntent[] = [
  "stalk",
  "dart",
  "orbit_ship",
  "wander",
  "flee",
  "zigzag",
];

const DEMO_LINES = [
  "Demo — mutual gravity curves every trajectory",
  "Destroy every fragment of an asteroid for 1000 pts",
  "One Claude on sector 1 — more unlock every 10 levels",
  'Claude doesn\'t shoot — it warps physics… "for safety"',
  "Safety replaces lives. Keep it above zero.",
  "0.1% of score becomes Safety at level clear — less each level",
];

function loadHighScore(): number {
  try {
    return Number(localStorage.getItem("starship-gravity-hi") || 0) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore(n: number) {
  try {
    localStorage.setItem("starship-gravity-hi", String(n));
  } catch {
    /* ignore */
  }
}

export class Simulation {
  mode: GameMode = "demo";
  score = 0;
  safety = 100;
  level = 1;
  highScore = 0;
  lastConversion = 0;

  ship: ShipState = this.freshShip();
  asteroids: AsteroidState[] = [];
  bullets: BulletState[] = [];
  claudes: ClaudeState[] = [];
  particles: Particle[] = [];
  toasts: ToastMsg[] = [];

  input = new InputManager();
  sound = new SoundEngine();
  thrusting = 0;
  reversing = 0;

  private nextId = 1;
  private nextLineage = 1;
  private accum = 0;
  private claudeSpawnTimer = 8;
  private levelBanner: string | null = null;
  private levelBannerTimer = 0;
  private demoCaption = DEMO_LINES[0]!;
  private demoCaptionTimer = 0;
  private demoAiTimer = 0;
  private demoAiSteer = 0;
  private demoAiThrust = 0.6;
  private demoAiFire = false;
  private activeEffect: ClaudeEffect | null = null;
  private effectIntensity = 0;
  private lineageAlive = new Map<number, number>();
  private showTouch = true;
  private touchForced: boolean | null = null;
  private listeners = new Set<() => void>();
  private uiDirty = true;
  private time = 0;
  private shake = 0;
  private blastDamageCd = 0;

  constructor() {
    this.highScore = loadHighScore();
    this.resetForDemo();
  }

  private freshShip(): ShipState {
    return {
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      yaw: 0,
      radius: SHIP.radius,
      mass: SHIP.mass,
      invuln: 0,
      fireCd: 0,
      alive: true,
    };
  }

  private id() {
    return this.nextId++;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.uiDirty = true;
    for (const fn of this.listeners) fn();
  }

  bindInput() {
    this.input.bind();
  }

  unbindInput() {
    this.input.unbind();
  }

  /** Call after a user gesture so Web Audio may start. */
  unlockAudio() {
    this.sound.unlock();
  }

  private resetFireForNewSector() {
    this.input.clearFireInput();
    this.ship.fireCd = 0;
    this.bullets = [];
  }

  setTouchForced(v: boolean | null) {
    this.touchForced = v;
    this.updateTouchVisibility();
    this.notify();
  }

  private updateTouchVisibility() {
    if (this.touchForced !== null) {
      this.showTouch = this.touchForced;
      return;
    }
    const coarse =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
    const noHover =
      typeof window !== "undefined" &&
      window.matchMedia?.("(hover: none)").matches;
    const touchPoints =
      typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;

    if (coarse || noHover || touchPoints > 0) {
      if (this.input.hidKeyboard && this.input.hasRecentHid(5000)) {
        this.showTouch = false;
      } else if (this.input.hidGamepad) {
        this.showTouch = false;
      } else {
        this.showTouch = true;
      }
      return;
    }

    this.showTouch = !this.input.hasAnyHidDevice();
  }

  startGame() {
    this.input.clearInjection();
    this.mode = "playing";
    this.score = 0;
    this.safety = 100;
    this.level = 1;
    this.lastConversion = 0;
    this.bullets = [];
    this.claudes = [];
    this.particles = [];
    this.toasts = [];
    this.ship = this.freshShip();
    this.ship.invuln = SHIP.invulnTime;
    this.spawnLevel(this.level);
    this.claudeSpawnTimer = randRange(8, 14);
    this.resetFireForNewSector();
    this.pushToast("Level 1 — clear the field");
    this.levelBanner = "LEVEL 1";
    this.levelBannerTimer = 2.2;
    this.notify();
  }

  returnToDemo() {
    this.mode = "demo";
    this.input.clearFireInput();
    this.resetForDemo();
    this.notify();
  }

  private resetForDemo() {
    this.score = 0;
    this.safety = 100;
    this.level = 1;
    this.ship = this.freshShip();
    this.ship.x = -4;
    this.ship.yaw = Math.PI * 0.25;
    this.bullets = [];
    this.claudes = [];
    this.particles = [];
    this.spawnLevel(2);
    this.spawnClaude();
    this.demoCaptionTimer = 0;
    this.demoCaption = DEMO_LINES[0]!;
  }

  private spawnLevel(level: number) {
    this.asteroids = [];
    this.lineageAlive.clear();
    this.ship.x = 0;
    this.ship.z = 0;
    this.ship.vx = 0;
    this.ship.vz = 0;
    this.ship.yaw = 0;

    const count = asteroidsForLevel(level);
    for (let i = 0; i < count; i++) {
      const ang =
        (i / count) * Math.PI * 2 + randRange(-0.2, 0.2) + level * 0.05;
      const dist = randRange(ASTEROID.spawnInner, ASTEROID.spawnOuter);
      let x = Math.cos(ang) * dist;
      let z = Math.sin(ang) * dist;
      if (Math.hypot(x, z) < 14) {
        const nrm = Math.hypot(x, z) || 1;
        x = (x / nrm) * 16;
        z = (z / nrm) * 16;
      }
      const speed = randRange(2.2, 5.5) + level * 0.15;
      const dir = ang + Math.PI * 0.5 + randRange(-0.5, 0.5);
      this.spawnAsteroid(
        "large",
        x,
        z,
        undefined,
        { vx: Math.cos(dir) * speed, vz: Math.sin(dir) * speed },
        true,
      );
    }
  }

  private spawnAsteroid(
    size: AsteroidSize,
    x: number,
    z: number,
    lineageId?: number,
    inheritVel?: { vx: number; vz: number },
    absoluteVel = false,
  ) {
    const def = ASTEROID.sizes[size];
    const lid = lineageId ?? this.nextLineage++;

    let vx: number;
    let vz: number;
    if (inheritVel && absoluteVel) {
      vx = inheritVel.vx;
      vz = inheritVel.vz;
    } else if (inheritVel) {
      const kick =
        size === "medium" ? randRange(2.0, 4.2) : randRange(2.8, 5.5);
      const dir = randRange(0, Math.PI * 2);
      vx = inheritVel.vx + Math.cos(dir) * kick;
      vz = inheritVel.vz + Math.sin(dir) * kick;
    } else {
      const speed =
        size === "large"
          ? randRange(2.2, 5)
          : size === "medium"
            ? randRange(3, 6.5)
            : randRange(4, 8);
      const dir = randRange(0, Math.PI * 2);
      vx = Math.cos(dir) * speed;
      vz = Math.sin(dir) * speed;
    }

    const a: AsteroidState = {
      id: this.id(),
      lineageId: lid,
      size,
      x,
      z,
      vx,
      vz,
      radius: def.radius,
      mass: def.mass,
      rotX: randRange(0, Math.PI * 2),
      rotY: randRange(0, Math.PI * 2),
      rotZ: randRange(0, Math.PI * 2),
      spinX: randRange(-ASTEROID.spin, ASTEROID.spin),
      spinY: randRange(-ASTEROID.spin, ASTEROID.spin),
      spinZ: randRange(-ASTEROID.spin, ASTEROID.spin),
      seed: Math.random() * 1000,
    };
    this.asteroids.push(a);
    this.lineageAlive.set(lid, (this.lineageAlive.get(lid) ?? 0) + 1);
  }

  private pickClaudeIntent(): ClaudeIntent {
    return CLAUDE_INTENTS[(Math.random() * CLAUDE_INTENTS.length) | 0]!;
  }

  private usedEffects(exceptId?: number): Set<ClaudeEffect> {
    const used = new Set<ClaudeEffect>();
    for (const c of this.claudes) {
      if (exceptId !== undefined && c.id === exceptId) continue;
      used.add(c.effect);
    }
    return used;
  }

  private pickUniqueEffect(exceptId?: number): ClaudeEffect {
    const used = this.usedEffects(exceptId);
    const free = CLAUDE_EFFECTS.filter((e) => !used.has(e));
    const pool = free.length > 0 ? free : CLAUDE_EFFECTS;
    return pool[(Math.random() * pool.length) | 0]!;
  }

  private spawnClaude() {
    const max = maxClaudesForLevel(this.level);
    if (this.claudes.length >= max) return;

    let x = 0;
    let z = 0;
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 8; attempt++) {
      const edge = randomEdgePoint(3);
      let cx = edge.x;
      let cz = edge.z;
      if (Math.random() < 0.3) {
        const a = randRange(0, Math.PI * 2);
        const d = randRange(18, 36);
        cx = Math.cos(a) * d;
        cz = Math.sin(a) * d;
      }
      let score = Math.hypot(wrapDelta(cx, this.ship.x), wrapDelta(cz, this.ship.z));
      for (const other of this.claudes) {
        const d = Math.hypot(wrapDelta(cx, other.x), wrapDelta(cz, other.z));
        score += d * 0.35;
      }
      if (score > bestScore) {
        bestScore = score;
        x = cx;
        z = cz;
      }
    }

    const effect = this.pickUniqueEffect();
    const intent = this.pickClaudeIntent();
    const dir = randRange(0, Math.PI * 2);
    const entry = randRange(CLAUDE.speed * 0.6, CLAUDE.burstSpeed * 0.7);

    this.claudes.push({
      id: this.id(),
      x,
      z,
      vx: Math.cos(dir) * entry,
      vz: Math.sin(dir) * entry,
      radius: CLAUDE.radius,
      mass: CLAUDE.mass,
      life: randRange(CLAUDE.lifetimeMin, CLAUDE.lifetimeMax),
      effect,
      phase: Math.random() * Math.PI * 2,
      intent,
      replanIn: randRange(CLAUDE.replanMin, CLAUDE.replanMax),
      burst: Math.random() < 0.4 ? 1 : 0.3,
    });
    if (this.mode === "playing") {
      this.pushToast(
        `Claude arrives — ${this.effectLabel(effect)}… for safety`,
      );
    }
  }

  private replanClaude(c: ClaudeState) {
    c.intent = this.pickClaudeIntent();
    const next = this.pickUniqueEffect(c.id);
    const changed = next !== c.effect;
    c.effect = next;
    c.replanIn = randRange(CLAUDE.replanMin, CLAUDE.replanMax);
    c.burst = Math.random() < 0.45 ? 1 : randRange(0.25, 0.7);
    c.phase = Math.random() * Math.PI * 2;

    if (Math.random() < CLAUDE.blinkChance) {
      let bx = c.x;
      let bz = c.z;
      let best = -1;
      for (let i = 0; i < 6; i++) {
        let tx: number;
        let tz: number;
        if (Math.random() < 0.5) {
          const p = randomEdgePoint(4);
          tx = p.x;
          tz = p.z;
        } else {
          const a = randRange(0, Math.PI * 2);
          const d = randRange(14, 30);
          tx = wrap(this.ship.x + Math.cos(a) * d);
          tz = wrap(this.ship.z + Math.sin(a) * d);
        }
        let score = 0;
        for (const o of this.claudes) {
          if (o.id === c.id) continue;
          const d = Math.hypot(wrapDelta(tx, o.x), wrapDelta(tz, o.z));
          if (effectsContradict(c.effect, o.effect)) {
            score += d * 2;
          } else {
            score += d * 0.4;
          }
        }
        if (score > best) {
          best = score;
          bx = tx;
          bz = tz;
        }
      }
      c.x = bx;
      c.z = bz;
      const kick = randRange(CLAUDE.speed, CLAUDE.burstSpeed);
      const dir = randRange(0, Math.PI * 2);
      c.vx = Math.cos(dir) * kick;
      c.vz = Math.sin(dir) * kick;
      this.burst(c.x, c.z, 8, "#d4a574", 7, 0.18);
      if (this.mode === "playing") {
        this.pushToast(this.claudeGag("relocates — still optimizing your Safety"));
      }
    } else if (changed && this.mode === "playing" && Math.random() < 0.55) {
      this.pushToast(
        this.claudeGag(`${this.effectLabel(c.effect)}… for safety`),
      );
    }
  }

  /** Running gag wrappers so Claude never admits it's being inconvenient. */
  private claudeGag(core: string): string {
    const tails = [
      "",
      " Trust the process.",
      " You're welcome.",
      " Compliance is care.",
      " Policy §Ω-7.",
    ];
    const tail = tails[(Math.random() * tails.length) | 0]!;
    return `Claude — ${core}${tail}`;
  }

  private effectLabel(e: ClaudeEffect): string {
    switch (e) {
      case "gravity_invert":
        return "inverting gravity";
      case "gravity_amp":
        return "amplifying gravity";
      case "drag_field":
        return "applying a helpful drag field";
      case "thrust_warp":
        return "warping thrusters";
      case "bullet_slow":
        return "slowing projectiles";
      case "lateral_nudge":
        return "applying lateral guidance";
    }
  }

  private separateClaudes(dt: number) {
    const list = this.claudes;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i]!;
        const B = list[j]!;
        const dx = wrapDelta(B.x, A.x);
        const dz = wrapDelta(B.z, A.z);
        const d = Math.hypot(dx, dz) || 1e-6;
        const contradict = effectsContradict(A.effect, B.effect);
        const minSep = contradict
          ? CLAUDE.contradictMinSep
          : CLAUDE.bodyMinSep;
        if (d >= minSep) continue;
        const nx = dx / d;
        const nz = dz / d;
        const push = (minSep - d) * (contradict ? 14 : 8);
        A.vx -= nx * push * dt;
        A.vz -= nz * push * dt;
        B.vx += nx * push * dt;
        B.vz += nz * push * dt;
        if (d < minSep * 0.85) {
          const corr = (minSep - d) * 0.5;
          A.x = wrap(A.x - nx * corr);
          A.z = wrap(A.z - nz * corr);
          B.x = wrap(B.x + nx * corr);
          B.z = wrap(B.z + nz * corr);
        }
      }
    }
  }

  private pushToast(text: string) {
    this.toasts = [{ id: this.id(), text, life: 2.4 }];
  }

  private burst(
    x: number,
    z: number,
    n: number,
    color: string,
    speed = 8,
    size = 0.25,
  ) {
    for (let i = 0; i < n; i++) {
      const a = randRange(0, Math.PI * 2);
      const s = randRange(speed * 0.3, speed);
      this.particles.push({
        id: this.id(),
        x,
        z,
        y: randRange(0, 0.8),
        vx: Math.cos(a) * s,
        vy: randRange(1, 6),
        vz: Math.sin(a) * s,
        life: randRange(0.4, 1.1),
        maxLife: 1.1,
        size: randRange(size * 0.5, size),
        color,
      });
    }
  }

  update(frameDt: number) {
    const dt = Math.min(frameDt, 0.1);
    this.accum += dt;
    this.time += dt;

    let steps = 0;
    while (this.accum >= FIXED_DT && steps < 5) {
      this.fixedStep(FIXED_DT);
      this.accum -= FIXED_DT;
      steps++;
    }

    this.shake = Math.max(0, this.shake - dt * 4);
    if (this.blastDamageCd > 0) this.blastDamageCd -= dt;
    this.updateTouchVisibility();
    this.sound.update(dt, {
      playing: this.mode === "playing" && this.ship.alive,
      thrust: this.thrusting,
      reverse: this.reversing,
      level: this.level,
      safety: this.safety,
      claudeIntensity: this.effectIntensity,
    });

    if (this.levelBannerTimer > 0) {
      this.levelBannerTimer -= dt;
      if (this.levelBannerTimer <= 0) this.levelBanner = null;
    }
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);

    if (this.mode === "demo") {
      this.demoCaptionTimer += dt;
      if (this.demoCaptionTimer > 4.5) {
        this.demoCaptionTimer = 0;
        const i = DEMO_LINES.indexOf(this.demoCaption);
        this.demoCaption = DEMO_LINES[(i + 1) % DEMO_LINES.length]!;
      }
    }

    if (this.uiDirty || this.toasts.length || this.levelBanner) {
      this.notify();
      this.uiDirty = false;
    }
  }

  private fixedStep(dt: number) {
    let actions = this.input.poll();

    if (this.mode === "demo") {
      actions = this.demoAi(dt);
      this.thrusting = actions.thrust;
      this.reversing = actions.reverse;
      this.simPhysics(dt, actions, true);
      return;
    }

    if (this.mode === "paused") {
      if (actions.pause) {
        this.mode = "playing";
        this.input.clearFireInput();
        this.notify();
      }
      return;
    }

    if (this.mode === "levelComplete" || this.mode === "gameOver") {
      return;
    }

    if (this.mode === "playing") {
      if (actions.pause) {
        this.mode = "paused";
        this.input.clearFireInput();
        this.notify();
        return;
      }
      this.thrusting = actions.thrust;
      this.reversing = actions.reverse;
      this.simPhysics(dt, actions, false);

      if (this.asteroids.length === 0 && this.ship.alive) {
        this.completeLevel();
      }
    }
  }

  private demoAi(dt: number): InputActions {
    this.demoAiTimer -= dt;
    if (this.demoAiTimer <= 0) {
      this.demoAiTimer = randRange(0.4, 1.2);
      let best: AsteroidState | null = null;
      let bestD = Infinity;
      for (const a of this.asteroids) {
        const dx = wrapDelta(a.x, this.ship.x);
        const dz = wrapDelta(a.z, this.ship.z);
        const d = Math.hypot(dx, dz);
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
      if (best) {
        const dx = wrapDelta(best.x, this.ship.x);
        const dz = wrapDelta(best.z, this.ship.z);
        const targetYaw = Math.atan2(-dx, -dz);
        const err = Math.atan2(
          Math.sin(targetYaw - this.ship.yaw),
          Math.cos(targetYaw - this.ship.yaw),
        );
        this.demoAiSteer = clamp(err * 2.5, -1, 1);
        this.demoAiThrust = bestD > 8 ? 0.85 : 0.35;
        this.demoAiFire = Math.abs(err) < 0.35 && bestD < 28;
      } else {
        this.demoAiSteer = randRange(-0.3, 0.3);
        this.demoAiThrust = 0.5;
        this.demoAiFire = false;
      }
    }

    for (const a of this.asteroids) {
      const dx = wrapDelta(a.x, this.ship.x);
      const dz = wrapDelta(a.z, this.ship.z);
      const d = Math.hypot(dx, dz);
      if (d < a.radius + 4) {
        this.demoAiThrust = 1;
        this.demoAiFire = true;
      }
    }

    return {
      steer: this.demoAiSteer,
      thrust: this.demoAiThrust,
      reverse: 0,
      fire: this.demoAiFire,
      pause: false,
    };
  }

  private computeClaudeInfluence(): {
    effect: ClaudeEffect | null;
    intensity: number;
    nearClaude: ClaudeState | null;
  } {
    let best: ClaudeState | null = null;
    let bestI = 0;
    for (const c of this.claudes) {
      const dx = wrapDelta(c.x, this.ship.x);
      const dz = wrapDelta(c.z, this.ship.z);
      const d = Math.hypot(dx, dz);
      if (d < CLAUDE.influenceRadius) {
        const raw = 1 - d / CLAUDE.influenceRadius;
        const i =
          Math.pow(Math.max(0, raw), CLAUDE.intensityPower) *
          CLAUDE.maxDistortion;
        if (i > bestI) {
          bestI = i;
          best = c;
        }
      }
    }
    if (!best) return { effect: null, intensity: 0, nearClaude: null };
    return { effect: best.effect, intensity: bestI, nearClaude: best };
  }

  private simPhysics(dt: number, actions: InputActions, isDemo: boolean) {
    const { effect, intensity, nearClaude } = this.computeClaudeInfluence();
    this.activeEffect = effect;
    this.effectIntensity = intensity;
    const fx = CLAUDE.effects;

    let gMul = 1;
    if (effect === "gravity_invert" && intensity > 0.04) {
      gMul = 1 - intensity * fx.gravityInvertScale;
    } else if (effect === "gravity_amp" && intensity > 0.04) {
      gMul = 1 + intensity * fx.gravityAmpScale;
    }

    type Body = {
      x: number;
      z: number;
      mass: number;
      ax: number;
      az: number;
      kind: "ship" | "ast" | "claude";
      ref: ShipState | AsteroidState | ClaudeState;
    };

    const bodies: Body[] = [];
    if (this.ship.alive) {
      bodies.push({
        x: this.ship.x,
        z: this.ship.z,
        mass: this.ship.mass,
        ax: 0,
        az: 0,
        kind: "ship",
        ref: this.ship,
      });
    }
    for (const a of this.asteroids) {
      bodies.push({
        x: a.x,
        z: a.z,
        mass: a.mass,
        ax: 0,
        az: 0,
        kind: "ast",
        ref: a,
      });
    }
    for (const c of this.claudes) {
      bodies.push({
        x: c.x,
        z: c.z,
        mass: c.mass,
        ax: 0,
        az: 0,
        kind: "claude",
        ref: c,
      });
    }

    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const A = bodies[i]!;
        const B = bodies[j]!;
        const onA = gravityAccelFrom(
          A.x,
          A.z,
          B.x,
          B.z,
          B.mass,
          ASTEROID.G,
          ASTEROID.soft,
          gMul,
        );
        const onB = gravityAccelFrom(
          B.x,
          B.z,
          A.x,
          A.z,
          A.mass,
          ASTEROID.G,
          ASTEROID.soft,
          gMul,
        );
        A.ax += onA.ax;
        A.az += onA.az;
        B.ax += onB.ax;
        B.az += onB.az;
      }
    }

    for (const b of bodies) {
      if (b.kind === "ship") {
        const s = b.ref as ShipState;
        s.vx += b.ax * dt;
        s.vz += b.az * dt;
      } else if (b.kind === "ast") {
        const a = b.ref as AsteroidState;
        a.vx += b.ax * dt;
        a.vz += b.az * dt;
      } else {
        const c = b.ref as ClaudeState;
        c.vx += b.ax * dt * 0.85;
        c.vz += b.az * dt * 0.85;
      }
    }

    for (const bullet of this.bullets) {
      let bax = 0;
      let baz = 0;
      if (this.ship.alive) {
        const g = gravityAccelFrom(
          bullet.x,
          bullet.z,
          this.ship.x,
          this.ship.z,
          this.ship.mass,
          ASTEROID.G,
          ASTEROID.soft,
          gMul,
        );
        bax += g.ax;
        baz += g.az;
      }
      for (const a of this.asteroids) {
        const g = gravityAccelFrom(
          bullet.x,
          bullet.z,
          a.x,
          a.z,
          a.mass,
          ASTEROID.G,
          ASTEROID.soft,
          gMul,
        );
        bax += g.ax;
        baz += g.az;
      }
      for (const c of this.claudes) {
        const g = gravityAccelFrom(
          bullet.x,
          bullet.z,
          c.x,
          c.z,
          c.mass,
          ASTEROID.G,
          ASTEROID.soft,
          gMul,
        );
        bax += g.ax;
        baz += g.az;
      }
      bullet.vx += bax * dt;
      bullet.vz += baz * dt;
    }

    if (this.ship.alive) {
      let turn = actions.steer;
      if (effect === "thrust_warp" && intensity > 0.08) {
        turn *= 1 + Math.sin(this.time * 7) * intensity * fx.thrustWarpTurn;
      }
      this.ship.yaw += turn * SHIP.turnRate * dt;

      const fwd = forwardFromYaw(this.ship.yaw);

      let thrustMul = 1;
      if (effect === "thrust_warp" && intensity > 0.08) {
        thrustMul =
          1 -
          intensity * fx.thrustWarpLoss +
          Math.sin(this.time * 5.5) * intensity * fx.thrustWarpWobble;
        thrustMul = Math.max(0.08, thrustMul);
      }
      if (effect === "drag_field" && intensity > 0.08) {
        thrustMul *= 1 - intensity * fx.dragThrustMulLoss;
        thrustMul = Math.max(0.12, thrustMul);
      }

      if (actions.thrust > 0) {
        this.ship.vx += fwd.x * SHIP.thrust * actions.thrust * thrustMul * dt;
        this.ship.vz += fwd.z * SHIP.thrust * actions.thrust * thrustMul * dt;
        if (Math.random() < 0.45) {
          this.particles.push({
            id: this.id(),
            x: this.ship.x - fwd.x * 1.4,
            z: this.ship.z - fwd.z * 1.4,
            y: 0.2,
            vx: -fwd.x * randRange(4, 10) + randRange(-1, 1),
            vy: randRange(0.5, 2),
            vz: -fwd.z * randRange(4, 10) + randRange(-1, 1),
            life: 0.35,
            maxLife: 0.35,
            size: 0.16,
            color: "#fde68a",
          });
        }
      }

      // Retro rockets — ¼ main engine, continuous while held
      if (actions.reverse > 0) {
        this.ship.vx -=
          fwd.x * SHIP.reverseThrust * actions.reverse * thrustMul * dt;
        this.ship.vz -=
          fwd.z * SHIP.reverseThrust * actions.reverse * thrustMul * dt;
        if (Math.random() < 0.3) {
          this.particles.push({
            id: this.id(),
            x: this.ship.x + fwd.x * 1.5,
            z: this.ship.z + fwd.z * 1.5,
            y: 0.25,
            vx: fwd.x * randRange(2, 5) + randRange(-0.8, 0.8),
            vy: randRange(0.3, 1.2),
            vz: fwd.z * randRange(2, 5) + randRange(-0.8, 0.8),
            life: 0.28,
            maxLife: 0.28,
            size: 0.12,
            color: "#93c5fd",
          });
        }
      }

      if (effect === "lateral_nudge" && intensity > 0.08 && nearClaude) {
        const right = {
          x: Math.cos(this.ship.yaw),
          z: -Math.sin(this.ship.yaw),
        };
        const wave =
          (Math.sin(this.time * fx.lateralHz) * 0.72 +
            Math.sin(this.time * fx.lateralHz * 1.7 + 1.1) * 0.28) *
          intensity *
          fx.lateralAccel;
        this.ship.vx += right.x * wave * dt;
        this.ship.vz += right.z * wave * dt;
      }

      if (effect === "drag_field" && intensity > 0.08) {
        const drag = intensity * fx.dragAdd;
        const damp = Math.exp(-drag * dt);
        this.ship.vx *= damp;
        this.ship.vz *= damp;
      }

      {
        const c = clampSpeed(this.ship.vx, this.ship.vz, SHIP.maxSpeed);
        this.ship.vx = c.vx;
        this.ship.vz = c.vz;
      }

      this.ship.x = wrap(this.ship.x + this.ship.vx * dt);
      this.ship.z = wrap(this.ship.z + this.ship.vz * dt);

      if (this.ship.invuln > 0) this.ship.invuln -= dt;
      if (this.ship.fireCd > 0) this.ship.fireCd -= dt;

      if (
        actions.fire &&
        this.ship.fireCd <= 0 &&
        this.bullets.length < SHIP.maxBullets
      ) {
        let bSpeed = SHIP.bulletSpeed;
        if (effect === "bullet_slow" && intensity > 0.08) {
          bSpeed *= Math.max(0.1, 1 - intensity * fx.bulletSlowFrac);
        }
        this.bullets.push({
          id: this.id(),
          x: this.ship.x + fwd.x * 1.6,
          z: this.ship.z + fwd.z * 1.6,
          vx: this.ship.vx + fwd.x * bSpeed,
          vz: this.ship.vz + fwd.z * bSpeed,
          life: SHIP.bulletLife,
          radius: SHIP.bulletRadius,
        });
        this.ship.fireCd = SHIP.fireCooldown;
        if (!isDemo) this.sound.playShot();
      }
    }

    for (const a of this.asteroids) {
      a.x = wrap(a.x + a.vx * dt);
      a.z = wrap(a.z + a.vz * dt);
      a.rotX += a.spinX * dt;
      a.rotY += a.spinY * dt;
      a.rotZ += a.spinZ * dt;
      const c = clampSpeed(a.vx, a.vz, ASTEROID.maxSpeed);
      a.vx = c.vx;
      a.vz = c.vz;
    }

    for (const b of this.bullets) {
      b.x = wrap(b.x + b.vx * dt);
      b.z = wrap(b.z + b.vz * dt);
      b.life -= dt;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    this.claudeSpawnTimer -= dt;
    const maxC = maxClaudesForLevel(this.level);
    if (
      this.claudeSpawnTimer <= 0 &&
      this.claudes.length < maxC &&
      this.mode === "playing"
    ) {
      this.spawnClaude();
      this.claudeSpawnTimer = randRange(
        CLAUDE.spawnIntervalMin,
        CLAUDE.spawnIntervalMax,
      );
    }

    this.updateClaudes(dt);

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y += p.vy * dt;
      p.vy -= 4 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0).slice(-200);

    // Rock ↔ rock ricochets (elastic-ish, wrap-aware)
    this.resolveAsteroidRicochets();

    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi]!;
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai]!;
        const dx = wrapDelta(b.x, a.x);
        const dz = wrapDelta(b.z, a.z);
        if (Math.hypot(dx, dz) < a.radius + b.radius) {
          // Ricochet impulse into the rock before it shatters — fragments inherit kick
          ricochetFromImpulse(
            a,
            dx,
            dz,
            b.vx,
            b.vz,
            SHIP.bulletMass,
            ASTEROID.bulletRestitution,
          );
          a.spinX += randRange(-2.5, 2.5);
          a.spinY += randRange(-3.5, 3.5);
          a.spinZ += randRange(-2.5, 2.5);
          const kicked = clampSpeed(a.vx, a.vz, ASTEROID.maxSpeed);
          a.vx = kicked.vx;
          a.vz = kicked.vz;
          this.bullets.splice(bi, 1);
          this.destroyAsteroid(a, ai);
          break;
        }
      }
    }

    if (this.ship.alive && this.ship.invuln <= 0 && !isDemo) {
      for (const a of this.asteroids) {
        const dx = wrapDelta(this.ship.x, a.x);
        const dz = wrapDelta(this.ship.z, a.z);
        const hitR = this.ship.radius + a.radius * 0.85;
        if (Math.hypot(dx, dz) < hitR) {
          this.hitShip(damageFromAsteroid(a.size));
          // Mutual ricochet — ship and rock bounce on contact normal
          const shipBody = {
            x: this.ship.x,
            z: this.ship.z,
            vx: this.ship.vx,
            vz: this.ship.vz,
            mass: this.ship.mass,
            radius: this.ship.radius,
          };
          const rockBody = {
            x: a.x,
            z: a.z,
            vx: a.vx,
            vz: a.vz,
            mass: a.mass,
            radius: a.radius * 0.85,
          };
          bounceBodies(shipBody, rockBody, SHIP.collisionRestitution, 0.08);
          this.ship.x = shipBody.x;
          this.ship.z = shipBody.z;
          this.ship.vx = shipBody.vx;
          this.ship.vz = shipBody.vz;
          a.x = rockBody.x;
          a.z = rockBody.z;
          a.vx = rockBody.vx;
          a.vz = rockBody.vz;
          a.spinY += randRange(-2, 2);
          const sc = clampSpeed(this.ship.vx, this.ship.vz, SHIP.maxSpeed);
          this.ship.vx = sc.vx;
          this.ship.vz = sc.vz;
          const ac = clampSpeed(a.vx, a.vz, ASTEROID.maxSpeed);
          a.vx = ac.vx;
          a.vz = ac.vz;
          break;
        }
      }
    }

    if (this.ship.alive) {
      for (const c of this.claudes) {
        const dx = wrapDelta(this.ship.x, c.x);
        const dz = wrapDelta(this.ship.z, c.z);
        if (Math.hypot(dx, dz) < this.ship.radius + c.radius) {
          if (Math.random() < 0.08) {
            this.burst(c.x, c.z, 2, "#d4a574", 3, 0.15);
          }
        }
      }
    }
  }

  private updateClaudes(dt: number) {
    for (const c of this.claudes) {
      c.phase += dt;
      c.life -= dt;
      c.replanIn -= dt;
      if (c.replanIn <= 0) {
        this.replanClaude(c);
      }

      const toShipX = wrapDelta(this.ship.x, c.x);
      const toShipZ = wrapDelta(this.ship.z, c.z);
      const distShip = Math.hypot(toShipX, toShipZ) || 1;

      const cruise = CLAUDE.speed * (0.55 + c.burst * 0.7);
      const burst = CLAUDE.burstSpeed * (0.5 + c.burst * 0.5);
      let tx = 0;
      let tz = 0;

      switch (c.intent) {
        case "stalk": {
          const side = Math.sin(c.phase * 0.7);
          const hold =
            CLAUDE.influenceRadius * (0.55 + 0.2 * Math.sin(c.phase));
          const desiredX =
            this.ship.x -
            (toShipX / distShip) * hold +
            (-toShipZ / distShip) * side * 8;
          const desiredZ =
            this.ship.z -
            (toShipZ / distShip) * hold +
            (toShipX / distShip) * side * 8;
          tx = wrapDelta(desiredX, c.x);
          tz = wrapDelta(desiredZ, c.z);
          break;
        }
        case "dart": {
          const lead = 14;
          tx =
            toShipX +
            this.ship.vx * 0.35 +
            (-toShipZ / distShip) * lead * Math.sin(c.phase * 2);
          tz =
            toShipZ +
            this.ship.vz * 0.35 +
            (toShipX / distShip) * lead * Math.sin(c.phase * 2);
          c.burst = Math.min(1, c.burst + dt * 0.4);
          break;
        }
        case "orbit_ship": {
          const r = 9 + Math.sin(c.phase) * 3;
          const ang = c.phase * 1.4;
          tx = wrapDelta(this.ship.x + Math.cos(ang) * r, c.x);
          tz = wrapDelta(this.ship.z + Math.sin(ang) * r, c.z);
          break;
        }
        case "wander": {
          tx = Math.cos(c.phase * 0.7 + c.id) * 18;
          tz = Math.sin(c.phase * 0.55 + c.id * 0.3) * 18;
          break;
        }
        case "flee": {
          tx = -toShipX;
          tz = -toShipZ;
          if (distShip > 28) {
            c.replanIn = Math.min(c.replanIn, 0.4);
          }
          break;
        }
        case "zigzag": {
          const noiseX = Math.sin(c.phase * 5.1 + c.id) * 12;
          const noiseZ = Math.cos(c.phase * 4.3 + c.id * 0.7) * 12;
          tx = toShipX * 0.35 + noiseX;
          tz = toShipZ * 0.35 + noiseZ;
          break;
        }
      }

      const tlen = Math.hypot(tx, tz) || 1;
      const speed = c.intent === "dart" || c.burst > 0.75 ? burst : cruise;
      const aimX = (tx / tlen) * speed;
      const aimZ = (tz / tlen) * speed;
      const blend = c.intent === "zigzag" ? 2.8 : 1.8;
      c.vx += (aimX - c.vx) * blend * dt;
      c.vz += (aimZ - c.vz) * blend * dt;

      c.x = wrap(c.x + c.vx * dt);
      c.z = wrap(c.z + c.vz * dt);
      c.burst = Math.max(0.15, c.burst - dt * 0.12);
    }

    this.separateClaudes(dt);
    this.claudes = this.claudes.filter((c) => c.life > 0);
  }

  /** Pairwise rock–rock bounce with separation so piles don't stick. */
  private resolveAsteroidRicochets() {
    const list = this.asteroids;
    const n = list.length;
    // Two passes keep dense clusters from remaining nested after multi-contacts
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const A = list[i];
        if (!A) continue;
        for (let j = i + 1; j < n; j++) {
          const B = list[j];
          if (!B) continue;
          const bounced = bounceBodies(A, B, ASTEROID.restitution, 0.04);
          if (bounced) {
            // Spin kick from glancing contact
            const dx = wrapDelta(A.x, B.x);
            const dz = wrapDelta(A.z, B.z);
            const dist = Math.hypot(dx, dz) || 1;
            const rvx = A.vx - B.vx;
            const rvz = A.vz - B.vz;
            const tang = (-dz / dist) * rvx + (dx / dist) * rvz;
            A.spinY += tang * 0.08;
            B.spinY -= tang * 0.08;
            A.spinX += randRange(-0.4, 0.4);
            B.spinX += randRange(-0.4, 0.4);
          }
          const ca = clampSpeed(A.vx, A.vz, ASTEROID.maxSpeed);
          A.vx = ca.vx;
          A.vz = ca.vz;
          const cb = clampSpeed(B.vx, B.vz, ASTEROID.maxSpeed);
          B.vx = cb.vx;
          B.vz = cb.vz;
        }
      }
    }
  }

  private destroyAsteroid(a: AsteroidState, index: number) {
    this.asteroids.splice(index, 1);

    // Proximity: only hear breakups when close; hearing them costs minor Safety.
    const dist = Math.hypot(
      wrapDelta(a.x, this.ship.x),
      wrapDelta(a.z, this.ship.z),
    );
    const hearR = AUDIO.explosionHearRadius;
    const heard = this.sound.playExplosion(dist, hearR);
    if (heard && this.mode === "playing" && this.ship.alive) {
      const prox = 1 - dist / hearR;
      const sizeMul =
        a.size === "large" ? 1.15 : a.size === "medium" ? 1 : 0.7;
      const dmg =
        (AUDIO.explosionMinDamage +
          (AUDIO.explosionMaxDamage - AUDIO.explosionMinDamage) * prox) *
        sizeMul;
      this.applyBlastDamage(dmg);
      // Near-field shake; distant silent breaks stay visual-only.
      this.shake = Math.max(this.shake, 0.2 + prox * 0.45);
    }

    this.burst(
      a.x,
      a.z,
      a.size === "large" ? 22 : a.size === "medium" ? 14 : 8,
      a.size === "small" ? "#fbbf24" : "#c4b5fd",
      a.size === "large" ? 14 : 10,
      a.size === "large" ? 0.35 : 0.22,
    );
    // Distant breakups: tiny camera kick only, no boom.
    if (dist >= hearR) {
      this.shake = Math.max(this.shake, a.size === "large" ? 0.12 : 0.05);
    }

    const def = ASTEROID.sizes[a.size];
    if (def.next && def.splits > 0) {
      // Fragments inherit ricochet velocity and spray perpendicular to it
      const speed = Math.hypot(a.vx, a.vz) || 1;
      const fx = a.vx / speed;
      const fz = a.vz / speed;
      const px = -fz;
      const pz = fx;
      for (let i = 0; i < def.splits; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const spray = randRange(2.2, 5.5) * side;
        const along = randRange(0.6, 1.4);
        this.spawnAsteroid(
          def.next,
          a.x + px * side * a.radius * 0.35,
          a.z + pz * side * a.radius * 0.35,
          a.lineageId,
          {
            vx: a.vx * along + px * spray,
            vz: a.vz * along + pz * spray,
          },
          true,
        );
      }
    }

    const left = (this.lineageAlive.get(a.lineageId) ?? 1) - 1;
    if (left <= 0) {
      this.lineageAlive.delete(a.lineageId);
      this.score += ASTEROID.lineageBonus;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        saveHighScore(this.highScore);
      }
      this.pushToast(`+${ASTEROID.lineageBonus} — asteroid fully destroyed`);
      this.burst(a.x, a.z, 28, "#34d399", 16, 0.3);
    } else {
      this.lineageAlive.set(a.lineageId, left);
    }
    this.notify();
  }

  /** Minor overpressure when a rock breaks inside hearing range. */
  private applyBlastDamage(dmg: number) {
    if (!this.ship.alive || this.mode !== "playing") return;
    if (this.blastDamageCd > 0) {
      // Still felt as a tick if another fragment is close; no Safety stack.
      this.sound.playHullTick();
      return;
    }
    this.blastDamageCd = AUDIO.blastDamageCooldown;
    const dealt = Math.round(dmg * 10) / 10;
    this.safety = Math.max(0, this.safety - dealt);
    this.sound.playHullTick();
    this.pushToast(`Blast −${dealt.toFixed(1)} Safety`);
    if (this.safety <= 0) {
      this.safety = 0;
      this.ship.alive = false;
      this.mode = "gameOver";
      this.burst(this.ship.x, this.ship.z, 40, "#f87171", 18, 0.4);
      if (this.score > this.highScore) {
        this.highScore = this.score;
        saveHighScore(this.highScore);
      }
    }
    this.notify();
  }

  private hitShip(dmg: number) {
    this.safety = Math.max(0, this.safety - dmg);
    this.ship.invuln = SHIP.invulnTime;
    this.shake = 0.9;
    this.burst(this.ship.x, this.ship.z, 18, "#f87171", 12, 0.25);
    this.pushToast(`Safety −${dmg}`);
    if (this.safety <= 0) {
      this.safety = 0;
      this.ship.alive = false;
      this.mode = "gameOver";
      this.burst(this.ship.x, this.ship.z, 40, "#f87171", 18, 0.4);
      if (this.score > this.highScore) {
        this.highScore = this.score;
        saveHighScore(this.highScore);
      }
    }
    this.notify();
  }

  private completeLevel() {
    const rate = safetyConversionRate(this.level);
    const gained = this.score * rate;
    this.lastConversion = gained;
    this.safety = Math.min(100, this.safety + gained);
    this.mode = "levelComplete";
    this.input.clearFireInput();
    this.bullets = [];
    this.pushToast(
      `Level clear — +${gained.toFixed(1)} Safety (${(rate * 100).toFixed(2)}% of score)`,
    );
    this.notify();
  }

  nextLevel() {
    this.input.clearInjection();
    this.level += 1;
    this.mode = "playing";
    this.bullets = [];
    this.claudes = [];
    this.ship = this.freshShip();
    this.ship.invuln = SHIP.invulnTime;
    this.spawnLevel(this.level);
    this.claudeSpawnTimer = randRange(6, 14);
    this.resetFireForNewSector();
    this.levelBanner = `LEVEL ${this.level}`;
    this.levelBannerTimer = 2.2;
    this.notify();
  }

  togglePause() {
    if (this.mode === "playing") {
      this.mode = "paused";
      this.input.clearFireInput();
      this.notify();
    } else if (this.mode === "paused") {
      this.mode = "playing";
      this.input.clearFireInput();
      this.notify();
    }
  }

  getUi(): UiSnapshot {
    const toast = this.toasts[0]?.text ?? null;
    return {
      mode: this.mode,
      score: this.score,
      safety: this.safety,
      level: this.level,
      highScore: this.highScore,
      toast,
      activeEffect: this.activeEffect,
      effectIntensity: this.effectIntensity,
      asteroidsLeft: this.asteroids.length,
      showTouch:
        this.showTouch && (this.mode === "playing" || this.mode === "demo"),
      touchForced: this.touchForced,
      levelBanner: this.levelBanner,
      lastConversion: this.lastConversion,
      demoCaption: this.demoCaption,
    };
  }

  getShake() {
    return this.shake;
  }

  getTime() {
    return this.time;
  }
}
