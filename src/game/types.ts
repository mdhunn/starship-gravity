export type GameMode = "demo" | "playing" | "paused" | "levelComplete" | "gameOver";

export type AsteroidSize = "large" | "medium" | "small";

export interface Vec2 {
  x: number;
  z: number;
}

export interface ShipState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  radius: number;
  mass: number;
  invuln: number;
  fireCd: number;
  alive: boolean;
}

export interface AsteroidState {
  id: number;
  lineageId: number;
  size: AsteroidSize;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  mass: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  seed: number;
}

export interface BulletState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  radius: number;
}

export type ClaudeEffect =
  | "gravity_invert"
  | "gravity_amp"
  | "drag_field"
  | "thrust_warp"
  | "bullet_slow"
  | "lateral_nudge";

export type ClaudeIntent =
  | "stalk"
  | "dart"
  | "orbit_ship"
  | "wander"
  | "flee"
  | "zigzag";

export interface ClaudeState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  mass: number;
  life: number;
  effect: ClaudeEffect;
  phase: number;
  intent: ClaudeIntent;
  replanIn: number;
  burst: number;
}

export interface Particle {
  id: number;
  x: number;
  z: number;
  y: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface ToastMsg {
  id: number;
  text: string;
  life: number;
}

export interface InputActions {
  /** -1..1, +1 = rotate left (player-visible left) */
  steer: number;
  /** 0..1 main engines forward */
  thrust: number;
  /** 0..1 retro rockets (¼ main thrust) */
  reverse: number;
  fire: boolean;
  pause: boolean;
}

export interface UiSnapshot {
  mode: GameMode;
  score: number;
  safety: number;
  level: number;
  highScore: number;
  toast: string | null;
  activeEffect: ClaudeEffect | null;
  effectIntensity: number;
  asteroidsLeft: number;
  showTouch: boolean;
  touchForced: boolean | null;
  levelBanner: string | null;
  lastConversion: number;
  demoCaption: string;
}

export interface ControlsProbe {
  getYaw: () => number;
  getSpeed: () => number;
  getPosition: () => { x: number; z: number };
  setSteer: (v: number) => void;
  setKeys: (codes: string[]) => void;
  getMode: () => GameMode;
  startGame: () => void;
  nextLevel: () => void;
  getBulletCount: () => number;
  clearFire: () => void;
}
