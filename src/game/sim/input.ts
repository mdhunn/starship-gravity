import type { InputActions } from "../types";

const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyP",
  "Escape",
  "Enter",
  "KeyF",
]);

/**
 * Normalize a KeyboardEvent into the set of logical codes we track.
 * Prefer e.code, fall back to e.key / legacy keyCode so arrows work in
 * embeds, remote desktops, and browsers that leave code blank.
 */
function codesFromEvent(e: KeyboardEvent): string[] {
  const out = new Set<string>();
  if (e.code && e.code !== "Unidentified") out.add(e.code);

  switch (e.key) {
    case "ArrowUp":
    case "Up":
      out.add("ArrowUp");
      break;
    case "ArrowDown":
    case "Down":
      out.add("ArrowDown");
      break;
    case "ArrowLeft":
    case "Left":
      out.add("ArrowLeft");
      break;
    case "ArrowRight":
    case "Right":
      out.add("ArrowRight");
      break;
    case " ":
    case "Spacebar":
    case "Space":
      out.add("Space");
      break;
    case "w":
    case "W":
      out.add("KeyW");
      break;
    case "a":
    case "A":
      out.add("KeyA");
      break;
    case "s":
    case "S":
      out.add("KeyS");
      break;
    case "d":
    case "D":
      out.add("KeyD");
      break;
    case "p":
    case "P":
      out.add("KeyP");
      break;
    case "f":
    case "F":
      out.add("KeyF");
      break;
    case "Escape":
    case "Esc":
      out.add("Escape");
      break;
    case "Enter":
      out.add("Enter");
      break;
    default:
      break;
  }

  const kc = e.keyCode || e.which;
  if (kc === 37) out.add("ArrowLeft");
  if (kc === 38) out.add("ArrowUp");
  if (kc === 39) out.add("ArrowRight");
  if (kc === 40) out.add("ArrowDown");
  if (kc === 32) out.add("Space");
  if (kc === 87) out.add("KeyW");
  if (kc === 65) out.add("KeyA");
  if (kc === 83) out.add("KeyS");
  if (kc === 68) out.add("KeyD");

  return [...out];
}

const FIRE_KEY_CODES = ["Space", "KeyF"] as const;

function radialDeadzone(x: number, y: number, dz = 0.18): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = ((m - dz) / (1 - dz)) / m;
  return { x: x * scale, y: y * scale };
}

function axisDead(v: number, dz = 0.18): number {
  if (Math.abs(v) < dz) return 0;
  const s = Math.sign(v);
  return s * ((Math.abs(v) - dz) / (1 - dz));
}

function btnPressed(pad: Gamepad, index: number, threshold = 0.35): boolean {
  const b = pad.buttons[index];
  if (!b) return false;
  if (b.pressed) return true;
  return (b.value ?? 0) > threshold;
}

function btnValue(pad: Gamepad, index: number): number {
  const b = pad.buttons[index];
  if (!b) return 0;
  if (b.pressed && (b.value === undefined || b.value === 0)) return 1;
  return b.value ?? (b.pressed ? 1 : 0);
}

function listGamepads(): Gamepad[] {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
  try {
    const raw = navigator.getGamepads();
    if (!raw) return [];
    const out: Gamepad[] = [];
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      if (p) out.push(p);
    }
    return out;
  } catch {
    return [];
  }
}

type PadSample = {
  steer: number;
  thrust: number;
  reverse: number;
  fire: boolean;
  pause: boolean;
  active: boolean;
};

/**
 * Sample one pad into game actions.
 * Accepts standard mapping and empty/non-standard mappings.
 */
function samplePad(pad: Gamepad): PadSample {
  let steer = 0;
  let thrust = 0;
  let reverse = 0;
  let fire = false;
  let pause = false;
  let active = false;

  const ax = pad.axes;
  const ls = radialDeadzone(ax[0] ?? 0, ax[1] ?? 0, 0.18);
  const rs = radialDeadzone(ax[2] ?? 0, ax[3] ?? 0, 0.22);
  const axis2 = axisDead(ax[2] ?? 0, 0.12);
  const axis3 = axisDead(ax[3] ?? 0, 0.12);
  const axis4 = axisDead(ax[4] ?? 0, 0.12);
  const axis5 = axisDead(ax[5] ?? 0, 0.12);

  steer += -ls.x;
  steer += -rs.x * 0.85;
  if (btnPressed(pad, 14)) {
    steer += 1;
    active = true;
  }
  if (btnPressed(pad, 15)) {
    steer -= 1;
    active = true;
  }

  if (ls.y < -0.15) thrust = Math.max(thrust, Math.min(1, -ls.y));
  if (ls.y > 0.15) reverse = Math.max(reverse, Math.min(1, ls.y));
  if (rs.y < -0.2) thrust = Math.max(thrust, Math.min(1, -rs.y));
  if (rs.y > 0.2) reverse = Math.max(reverse, Math.min(1, rs.y));

  if (btnPressed(pad, 12)) {
    thrust = 1;
    active = true;
  }
  if (btnPressed(pad, 13)) {
    reverse = 1;
    active = true;
  }

  if (btnPressed(pad, 0)) {
    fire = true;
    active = true;
  }
  if (btnPressed(pad, 1)) {
    fire = true;
    active = true;
  }
  if (btnPressed(pad, 2)) {
    reverse = Math.max(reverse, 1);
    active = true;
  }
  if (btnPressed(pad, 3)) {
    thrust = Math.max(thrust, 1);
    active = true;
  }

  if (btnPressed(pad, 4)) {
    reverse = Math.max(reverse, 1);
    active = true;
  }
  if (btnPressed(pad, 5)) {
    fire = true;
    active = true;
  }
  const lt = btnValue(pad, 6);
  const rt = btnValue(pad, 7);
  if (lt > 0.12) {
    reverse = Math.max(reverse, Math.min(1, lt));
    active = true;
  }
  if (rt > 0.12) {
    thrust = Math.max(thrust, Math.min(1, rt));
    if (rt > 0.55) fire = true;
    active = true;
  }

  if (btnPressed(pad, 9) || btnPressed(pad, 8)) {
    pause = true;
    active = true;
  }

  if (pad.mapping !== "standard" && pad.buttons.length < 8) {
    if (axis5 > 0.2) {
      thrust = Math.max(thrust, axis5);
      active = true;
    }
    if (axis4 > 0.2) {
      reverse = Math.max(reverse, axis4);
      active = true;
    }
    if (axis2 > 0.25) {
      thrust = Math.max(thrust, axis2);
      active = true;
    }
    if (axis2 < -0.25) {
      reverse = Math.max(reverse, -axis2);
      active = true;
    }
    if (axis3 > 0.35) {
      reverse = Math.max(reverse, axis3);
      active = true;
    }
  }

  if (Math.abs(ls.x) > 0.08 || Math.abs(ls.y) > 0.08) active = true;
  if (Math.abs(rs.x) > 0.08 || Math.abs(rs.y) > 0.08) active = true;

  return { steer, thrust, reverse, fire, pause, active };
}

/**
 * Unified input: keyboard + gamepad + touch overlays.
 *
 * Fire latch: after clearFireInput() / sector start, fire stays suppressed
 * until every fire source is fully released, then a new press is required.
 * Do NOT strip keys on clear — that falsely arms the latch while Space is held.
 */
export class InputManager {
  private keys = new Set<string>();
  private injectedKeys: string[] | null = null;
  private injectedSteer: number | null = null;

  touchSteer = 0;
  touchThrust = 0;
  touchReverse = 0;
  touchFire = false;

  hidKeyboard = false;
  hidMouse = false;
  hidGamepad = false;
  lastHidAt = 0;

  private fireEdge = false;
  private prevFire = false;
  private pauseEdge = false;
  private prevPause = false;

  /**
   * When true, all fire output is forced off until raw fire is fully released.
   * Set on game start, sector transitions, pause, and blur.
   */
  private fireNeedsRelease = false;

  private bound = false;

  bind() {
    if (this.bound || typeof window === "undefined") return;
    this.bound = true;

    window.addEventListener("keydown", this.onKeyDown, {
      capture: true,
      passive: false,
    });
    window.addEventListener("keyup", this.onKeyUp, {
      capture: true,
      passive: false,
    });
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    window.addEventListener("pointerdown", this.onPointer, { passive: true });
    window.addEventListener("gamepadconnected", this.onPadConnect);
    window.addEventListener("gamepaddisconnected", this.onPadDisconnect);

    this.scanPadsForPresence();
  }

  unbind() {
    if (!this.bound) return;
    this.bound = false;
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("pointermove", this.onPointer);
    window.removeEventListener("pointerdown", this.onPointer);
    window.removeEventListener("gamepadconnected", this.onPadConnect);
    window.removeEventListener("gamepaddisconnected", this.onPadDisconnect);
  }

  clearInjection() {
    this.injectedKeys = null;
    this.injectedSteer = null;
  }

  /**
   * Force a clean released fire state. Call on game start and every sector
   * transition. Player must fully release fire, then press again.
   *
   * Important: do not delete held fire keys — that made the latch arm while
   * Space was still physically down (no keyup), allowing auto-fire.
   */
  clearFireInput() {
    this.touchFire = false;
    // Strip injected fire only (QA harness), keep real keys so we can see holds
    if (this.injectedKeys) {
      this.injectedKeys = this.injectedKeys.filter(
        (c) => c !== "Space" && c !== "KeyF",
      );
    }
    this.prevFire = false;
    this.fireEdge = false;
    this.fireNeedsRelease = true;
  }

  clearTouchLatches() {
    this.touchSteer = 0;
    this.touchThrust = 0;
    this.touchReverse = 0;
    this.touchFire = false;
  }

  handleNativeKey(e: KeyboardEvent, down: boolean) {
    if (down) this.onKeyDown(e);
    else this.onKeyUp(e);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const codes = codesFromEvent(e);
    if (codes.length === 0) return;

    this.hidKeyboard = true;
    this.lastHidAt = performance.now();
    for (const c of codes) this.keys.add(c);

    if (codes.some((c) => GAME_CODES.has(c))) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const codes = codesFromEvent(e);
    for (const c of codes) this.keys.delete(c);
  };

  private onBlur = () => {
    this.keys.clear();
    this.clearTouchLatches();
    this.fireNeedsRelease = true;
    this.prevFire = false;
  };

  private onVis = () => {
    if (document.hidden) {
      this.keys.clear();
      this.clearTouchLatches();
      this.fireNeedsRelease = true;
      this.prevFire = false;
    }
  };

  private onPointer = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      this.hidMouse = true;
      this.lastHidAt = performance.now();
    }
  };

  private onPadConnect = () => {
    this.hidGamepad = true;
    this.lastHidAt = performance.now();
  };

  private onPadDisconnect = () => {
    this.scanPadsForPresence();
  };

  private scanPadsForPresence() {
    const pads = listGamepads();
    this.hidGamepad = pads.length > 0;
    if (this.hidGamepad) this.lastHidAt = performance.now();
  }

  setInjectedKeys(codes: string[] | null) {
    this.injectedKeys = codes ?? null;
  }

  setInjectedSteer(v: number | null) {
    this.injectedSteer = v;
  }

  private keyDown(code: string): boolean {
    if (this.keys.has(code)) return true;
    if (this.injectedKeys?.includes(code)) return true;
    return false;
  }

  private sampleGamepads(): PadSample {
    let steer = 0;
    let thrust = 0;
    let reverse = 0;
    let fire = false;
    let pause = false;
    let any = false;

    for (const pad of listGamepads()) {
      const s = samplePad(pad);
      if (s.active) {
        any = true;
        this.hidGamepad = true;
        this.lastHidAt = performance.now();
      }
      steer += s.steer;
      thrust = Math.max(thrust, s.thrust);
      reverse = Math.max(reverse, s.reverse);
      if (s.fire) fire = true;
      if (s.pause) pause = true;
    }

    void any;
    return { steer, thrust, reverse, fire, pause, active: any };
  }

  /** Raw fire from every device, no latch applied. */
  private sampleRawFire(padFire: boolean): boolean {
    if (this.keyDown("Space") || this.keyDown("KeyF")) return true;
    if (this.touchFire) return true;
    if (padFire) return true;
    return false;
  }

  poll(): InputActions {
    let steer = 0;
    let thrust = 0;
    let reverse = 0;
    let pause = false;

    if (this.keyDown("KeyA") || this.keyDown("ArrowLeft")) steer += 1;
    if (this.keyDown("KeyD") || this.keyDown("ArrowRight")) steer -= 1;
    if (this.keyDown("KeyW") || this.keyDown("ArrowUp")) thrust = 1;
    if (this.keyDown("KeyS") || this.keyDown("ArrowDown")) reverse = 1;
    if (this.keyDown("KeyP") || this.keyDown("Escape")) pause = true;

    steer += this.touchSteer;
    thrust = Math.max(thrust, this.touchThrust);
    reverse = Math.max(reverse, this.touchReverse);

    const pad = this.sampleGamepads();
    steer += pad.steer;
    thrust = Math.max(thrust, pad.thrust);
    reverse = Math.max(reverse, pad.reverse);
    if (pad.pause) pause = true;

    let fire = this.sampleRawFire(pad.fire);

    // Fire gate: suppress until full release after clear / sector start
    if (this.fireNeedsRelease) {
      if (!fire) {
        // All sources released — next press will fire
        this.fireNeedsRelease = false;
      } else {
        // Still held (keyboard / pad / touch) — keep dead
        fire = false;
      }
    }

    if (this.injectedSteer !== null) {
      steer = this.injectedSteer;
    }

    steer = Math.max(-1, Math.min(1, steer));
    thrust = Math.max(0, Math.min(1, thrust));
    reverse = Math.max(0, Math.min(1, reverse));

    this.fireEdge = fire && !this.prevFire;
    this.prevFire = fire;
    this.pauseEdge = pause && !this.prevPause;
    this.prevPause = pause;

    return {
      steer,
      thrust,
      reverse,
      fire,
      pause: this.pauseEdge,
    };
  }

  get justFired() {
    return this.fireEdge;
  }

  hasRecentHid(withinMs = 8000): boolean {
    if (!this.hidKeyboard && !this.hidMouse && !this.hidGamepad) return false;
    if (this.hidGamepad && listGamepads().length > 0) return true;
    return performance.now() - this.lastHidAt < withinMs;
  }

  hasAnyHidDevice(): boolean {
    return this.hidKeyboard || this.hidMouse || this.hidGamepad;
  }

  heldCodes(): string[] {
    return [...this.keys];
  }
}
