/**
 * World half-extent on X/Z — wrap-around playfield.
 * ~2.5× the original 48 unit half-extent so the grid and arena feel wide.
 */
export const WORLD_HALF = 120;

/** Full playfield width (edge-to-edge). */
export const WORLD_SIZE = WORLD_HALF * 2;

/** Fixed simulation step */
export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.1;

export const SHIP = {
  radius: 1.05,
  mass: 2.0,
  thrust: 28,
  /** Retro rockets — ¼ main engine thrust */
  reverseThrust: 28 * 0.25,
  turnRate: 3.2,
  maxSpeed: 42,
  /** No ambient drag — Newtonian vacuum. Drag only via Claude. */
  drag: 0,
  invulnTime: 2.2,
  fireCooldown: 0.18,
  bulletSpeed: 52,
  bulletLife: 1.35,
  bulletRadius: 0.22,
  maxBullets: 8,
  collisionDamageBase: 18,
  bulletMass: 0.05,
  /** Ship ↔ rock bounce coefficient */
  collisionRestitution: 0.72,
} as const;

/**
 * Relativistic presentation + mild dynamics.
 * c is set so cruise near maxSpeed is a large β — effects become obvious
 * in the upper third of the speed band without making the ship unplayable.
 */
export const RELATIVITY = {
  /** Effective light speed (world units / s). maxSpeed/c ≈ 0.875 → γ ≈ 2.1 */
  c: 48,
  /** β below this: effects ramped softly (still continuous). */
  softBeta: 0.2,
  /** FOV boost per (γ − 1) on the chase cam */
  fovPerGamma: 14,
  /** Max extra FOV degrees */
  maxFovBoost: 22,
  /** Grid length-contraction blend (1 = full 1/γ along velocity) */
  gridContract: 0.92,
  /** Source-mass boost: m_rel = m * (1 + massGain*(γ−1)) */
  massGain: 0.85,
  /** Proper-time scale on pilot inputs: turn/fire use dt/γ^k */
  pilotTimeExp: 0.65,
} as const;

export const ASTEROID = {
  sizes: {
    large: { radius: 3.4, mass: 10, hp: 1, splits: 2, next: "medium" as const },
    medium: { radius: 2.0, mass: 4.5, hp: 1, splits: 2, next: "small" as const },
    small: { radius: 1.05, mass: 1.6, hp: 1, splits: 0, next: null },
  },
  spin: 1.8,
  lineageBonus: 1000,
  /**
   * Gravity profile scaled so characteristic range is 2× the original:
   * soft′ = 2·soft₀, G′ = 4·G₀ keeps near-field peak force while the
   * 1/r² tail stays strong twice as far out.
   * Original: G=25, soft=2.8
   */
  G: 100,
  soft: 5.6,
  maxSpeed: 36,
  spawnInner: 22,
  spawnOuter: 55,
  /** Rock ↔ rock bounce */
  restitution: 0.9,
  /** Rock response to bullet impact before shatter */
  bulletRestitution: 0.62,
} as const;

/**
 * Audio / blast proximity.
 * Explosions are silent beyond hearRadius; inside that bubble they are
 * audible and inflict minor overpressure damage to the hull.
 */
export const AUDIO = {
  /** Max distance (world units) at which rock breakups are heard. */
  explosionHearRadius: 13,
  /** Minor Safety damage at zero range (scaled down by distance). */
  explosionMaxDamage: 4.2,
  explosionMinDamage: 1.0,
  /** Cooldown so multi-split chains don't melt Safety instantly. */
  blastDamageCooldown: 0.32,
} as const;

export const CLAUDE = {
  radius: 1.6,
  mass: 4.5,
  speed: 9.5,
  burstSpeed: 16,
  influenceRadius: 18,
  spawnIntervalMin: 12,
  spawnIntervalMax: 26,
  lifetimeMin: 14,
  lifetimeMax: 28,
  maxDistortion: 1,
  intensityPower: 0.72,
  replanMin: 1.8,
  replanMax: 4.2,
  blinkChance: 0.18,
  contradictMinSep: 22,
  bodyMinSep: 5,
  effects: {
    gravityInvertScale: 2.55,
    gravityAmpScale: 2.6,
    dragAdd: 3.6,
    dragThrustMulLoss: 0.55,
    thrustWarpTurn: 1.55,
    thrustWarpLoss: 0.72,
    thrustWarpWobble: 0.55,
    bulletSlowFrac: 0.88,
    lateralAccel: 32,
    lateralHz: 4.1,
  },
} as const;

export function maxClaudesForLevel(level: number): number {
  return Math.min(1 + Math.floor(Math.max(1, level) / 10), 6);
}

/** Starting large-rock count per sector — doubled from original. */
export function asteroidsForLevel(level: number): number {
  return Math.min(8 + level * 2, 20);
}

export function safetyConversionRate(level: number): number {
  const base = 0.001;
  const decay = 1 / (1 + Math.max(0, level - 1) * 0.2);
  return Math.max(0.0002, base * decay);
}

export function damageFromAsteroid(size: "large" | "medium" | "small"): number {
  if (size === "large") return 28;
  if (size === "medium") return 18;
  return 10;
}
