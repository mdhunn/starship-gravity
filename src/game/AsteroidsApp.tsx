import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Simulation } from "./sim/Simulation";
import { GameCanvas } from "./render/GameScene";
import { HUD } from "./ui/HUD";
import { Overlays } from "./ui/Overlays";
import { TouchControls } from "./ui/TouchControls";
import { SystemClock } from "./ui/SystemClock";
import type { ControlsProbe, UiSnapshot } from "./types";
import type { AudioChannelSettings } from "./audio/SoundEngine";
import { Smartphone } from "lucide-react";

function useIsClient() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      /* user denied or unsupported */
    }
  }, []);

  return { isFullscreen, toggle };
}

const LOCKABLE_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "KeyP",
  "KeyF",
  "Escape",
];

type KeyboardLockAPI = {
  lock?: (keys?: string[]) => Promise<void>;
  unlock?: () => void;
};

function getKeyboardAPI(): KeyboardLockAPI | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { keyboard?: KeyboardLockAPI }).keyboard;
}

export function AsteroidsApp() {
  const ready = useIsClient();
  const sim = useMemo(() => new Simulation(), []);
  const shellRef = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState<UiSnapshot>(() => sim.getUi());
  const [audioSettings, setAudioSettings] = useState<AudioChannelSettings>(() =>
    sim.sound.getSettings(),
  );
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const uiRaf = useRef(0);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const flushUi = useCallback(() => {
    if (uiRaf.current) return;
    uiRaf.current = requestAnimationFrame(() => {
      uiRaf.current = 0;
      setUi(sim.getUi());
    });
  }, [sim]);

  const focusShell = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== el && el.contains(active)) {
      active.blur();
    }
    el.focus({ preventScroll: true });
  }, []);

  const tryKeyboardLock = useCallback(async () => {
    try {
      const kb = getKeyboardAPI();
      if (kb?.lock) await kb.lock(LOCKABLE_KEYS);
    } catch {
      /* unsupported or denied */
    }
  }, []);

  const onAudioChange = useCallback(
    (partial: Partial<AudioChannelSettings>) => {
      sim.unlockAudio();
      sim.sound.setSettings(partial);
      setAudioSettings(sim.sound.getSettings());
    },
    [sim],
  );

  useEffect(() => {
    sim.bindInput();
    const unsub = sim.subscribe(flushUi);

    const unlock = () => {
      sim.unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });

    const probe: ControlsProbe = {
      getYaw: () => sim.ship.yaw,
      getSpeed: () => Math.hypot(sim.ship.vx, sim.ship.vz),
      getPosition: () => ({ x: sim.ship.x, z: sim.ship.z }),
      setSteer: (v) => sim.input.setInjectedSteer(v),
      setKeys: (codes) => sim.input.setInjectedKeys(codes),
      getMode: () => sim.mode,
      startGame: () => {
        sim.unlockAudio();
        setShowAudioMenu(false);
        sim.input.clearInjection();
        sim.startGame();
        requestAnimationFrame(() => {
          focusShell();
          void tryKeyboardLock();
        });
      },
      nextLevel: () => sim.nextLevel(),
      getBulletCount: () => sim.bullets.length,
      clearFire: () => sim.input.clearFireInput(),
    };
    window.__controlsTest = probe;

    return () => {
      unsub();
      sim.unbindInput();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      if (window.__controlsTest === probe) delete window.__controlsTest;
      if (uiRaf.current) cancelAnimationFrame(uiRaf.current);
      try {
        getKeyboardAPI()?.unlock?.();
      } catch {
        /* ignore */
      }
      sim.sound.dispose();
    };
  }, [sim, flushUi, focusShell, tryKeyboardLock]);

  useEffect(() => {
    if (ui.mode !== "demo" && ui.mode !== "paused") {
      setShowAudioMenu(false);
    }
    if (ui.mode === "playing") {
      focusShell();
      void tryKeyboardLock();
    }
  }, [ui.mode, focusShell, tryKeyboardLock]);

  if (!ready) {
    return (
      <div className="game-shell" style={{ display: "grid", placeItems: "center" }}>
        <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
          Initializing thrusters…
        </div>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className="game-shell"
      tabIndex={0}
      role="application"
      aria-label="Starship Gravity"
      onPointerDown={() => {
        sim.unlockAudio();
        if (ui.mode === "playing") focusShell();
      }}
      onKeyDown={(e) => {
        sim.input.handleNativeKey(e.nativeEvent, true);
      }}
      onKeyUp={(e) => {
        sim.input.handleNativeKey(e.nativeEvent, false);
      }}
    >
      <GameCanvas sim={sim} onUi={flushUi} />
      <HUD
        ui={ui}
        onPause={() => {
          sim.unlockAudio();
          focusShell();
          sim.togglePause();
        }}
        onToggleFullscreen={() => {
          focusShell();
          void toggleFullscreen();
        }}
        isFullscreen={isFullscreen}
      />
      <TouchControls
        input={sim.input}
        visible={ui.showTouch && ui.mode === "playing"}
      />
      <Overlays
        ui={ui}
        sim={sim}
        audioSettings={audioSettings}
        onAudioChange={onAudioChange}
        showAudioMenu={showAudioMenu}
        onOpenAudio={() => setShowAudioMenu(true)}
        onCloseAudio={() => setShowAudioMenu(false)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => {
          focusShell();
          void toggleFullscreen();
        }}
      />
      {/* Clock on demo + play while fullscreen (HUD is hidden on demo) */}
      <SystemClock visible={isFullscreen} />

      {ui.mode === "playing" && (
        <div className="touch-hint">
          <button
            type="button"
            className="btn btn-secondary"
            style={{
              minHeight: 40,
              padding: "8px 12px",
              fontSize: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: 6,
              background:
                "color-mix(in oklab, var(--color-surface) 75%, transparent)",
            }}
            onClick={() => {
              const next =
                ui.touchForced === null
                  ? true
                  : ui.touchForced === true
                    ? false
                    : null;
              sim.setTouchForced(next);
              focusShell();
            }}
            aria-label="Toggle touch controls"
          >
            <Smartphone size={14} />
            {ui.touchForced === null
              ? "Touch Auto"
              : ui.touchForced
                ? "Touch On"
                : "Touch Off"}
          </button>
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
