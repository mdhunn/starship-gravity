import type { UiSnapshot } from "../types";
import {
  Shield,
  Sparkles,
  Orbit,
  Pause,
  Maximize2,
  Minimize2,
} from "lucide-react";

function effectText(e: UiSnapshot["activeEffect"]): string | null {
  if (!e) return null;
  switch (e) {
    case "gravity_invert":
      return "Gravity inverted — for safety";
    case "gravity_amp":
      return "Gravity amplified — for safety";
    case "drag_field":
      return "Drag field engaged — for safety";
    case "thrust_warp":
      return "Thrusters warped — for safety";
    case "bullet_slow":
      return "Projectiles slowed — for safety";
    case "lateral_nudge":
      return "Lateral guidance — for safety";
  }
}

export function HUD({
  ui,
  onPause,
  onToggleFullscreen,
  isFullscreen,
}: {
  ui: UiSnapshot;
  onPause?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}) {
  if (ui.mode === "demo") return null;

  const effect =
    ui.activeEffect && ui.effectIntensity > 0.12
      ? effectText(ui.activeEffect)
      : null;
  const safetyPct = Math.max(0, Math.min(100, ui.safety));
  const showToast = Boolean(ui.toast) && !ui.levelBanner;
  const showClaude = Boolean(effect) && !ui.levelBanner;
  const showStack = showClaude || showToast;
  const showPlayControls = ui.mode === "playing";

  return (
    <div className="hud">
      <div
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top))",
          left: "max(12px, env(safe-area-inset-left))",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: "42vw",
        }}
      >
        <div className="hud-panel" style={{ minWidth: 140 }}>
          <div className="hud-stat-label">Score</div>
          <div className="hud-stat-value">{ui.score.toLocaleString()}</div>
        </div>
        <div className="hud-panel" style={{ minWidth: 140 }}>
          <div className="hud-stat-label">Level {ui.level}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
            }}
          >
            <Orbit size={14} color="var(--color-muted)" />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                color: "var(--color-muted)",
              }}
            >
              {ui.asteroidsLeft} rocks
            </span>
          </div>
        </div>
      </div>

      <div
        className="hud-top-right"
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top))",
          right: "max(12px, env(safe-area-inset-right))",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <div className="hud-panel" style={{ minWidth: 160 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div
              className="hud-stat-label"
              style={{ display: "flex", gap: 6, alignItems: "center" }}
            >
              <Shield size={12} color="var(--color-safety)" />
              Safety
            </div>
            <div
              className="hud-stat-value"
              style={{
                fontSize: "1.05rem",
                color:
                  safetyPct < 25
                    ? "var(--color-danger)"
                    : safetyPct < 50
                      ? "var(--color-warning)"
                      : "var(--color-safety)",
              }}
            >
              {safetyPct.toFixed(0)}
            </div>
          </div>
          <div className="safety-bar">
            <div className="safety-bar-fill" style={{ width: `${safetyPct}%` }} />
          </div>
        </div>

        {showPlayControls && (
          <div className="hud-control-row">
            {onPause && (
              <button
                type="button"
                className="btn btn-secondary hud-pause-btn"
                onClick={onPause}
                aria-label="Pause"
              >
                <Pause size={16} />
                Pause
              </button>
            )}
            {onToggleFullscreen && (
              <button
                type="button"
                className="btn btn-secondary hud-pause-btn"
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                {isFullscreen ? "Exit" : "Full"}
              </button>
            )}
          </div>
        )}
      </div>

      {ui.levelBanner && (
        <div className="notify-level" aria-live="polite">
          {ui.levelBanner}
        </div>
      )}

      {/* Ship-anchored stack: Claude on top, toast below — gap prevents overlap */}
      {showStack && (
        <div className="notify-stack" aria-live="polite">
          {showClaude && (
            <div className="notify-claude">
              <Sparkles size={14} />
              <span>
                Claude — {effect}
                <span className="notify-claude-pct">
                  {" "}
                  {(ui.effectIntensity * 100).toFixed(0)}%
                </span>
              </span>
            </div>
          )}
          {showToast && (
            <div className="notify-toast">{ui.toast}</div>
          )}
        </div>
      )}
    </div>
  );
}
