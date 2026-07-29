import {
  Atom,
  Bot,
  Crosshair,
  Keyboard,
  Maximize2,
  Minimize2,
  Rocket,
  Settings2,
  Shield,
} from "lucide-react";
import type { Simulation } from "../sim/Simulation";
import type { UiSnapshot } from "../types";
import type { AudioChannelSettings } from "../audio/SoundEngine";
import { safetyConversionRate } from "../constants";
import { AudioSettingsPanel } from "./AudioSettings";

function FullscreenBtn({
  isFullscreen,
  onToggle,
}: {
  isFullscreen: boolean;
  onToggle?: () => void;
}) {
  if (!onToggle) return null;
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{
        minHeight: 40,
        padding: "8px 12px",
        fontSize: "0.78rem",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      onClick={onToggle}
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    >
      {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      {isFullscreen ? "Exit" : "Full"}
    </button>
  );
}

export function Overlays({
  ui,
  sim,
  audioSettings,
  onAudioChange,
  showAudioMenu,
  onOpenAudio,
  onCloseAudio,
  isFullscreen = false,
  onToggleFullscreen,
}: {
  ui: UiSnapshot;
  sim: Simulation;
  audioSettings: AudioChannelSettings;
  onAudioChange: (partial: Partial<AudioChannelSettings>) => void;
  showAudioMenu: boolean;
  onOpenAudio: () => void;
  onCloseAudio: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}) {
  if (ui.mode === "playing") {
    return null;
  }

  if (showAudioMenu && ui.mode === "demo") {
    return (
      <div className="overlay-screen">
        <div className="overlay-card" style={{ maxWidth: 440 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <h1 className="overlay-title" style={{ fontSize: "1.45rem", margin: 0 }}>
              Audio
            </h1>
            <FullscreenBtn
              isFullscreen={isFullscreen}
              onToggle={
                onToggleFullscreen
                  ? () => {
                      sim.unlockAudio();
                      onToggleFullscreen();
                    }
                  : undefined
              }
            />
          </div>
          <p className="overlay-subtitle">
            Toggle cockpit channels and set their volumes. Choices are saved
            for next launch.
          </p>
          <AudioSettingsPanel
            settings={audioSettings}
            onChange={onAudioChange}
          />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onCloseAudio}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (ui.mode === "levelComplete") {
    const rate = safetyConversionRate(ui.level);
    return (
      <div className="overlay-screen">
        <div className="overlay-card">
          <h1 className="overlay-title">Sector clear</h1>
          <p className="overlay-subtitle">
            Field emptied. Converting score → Safety at{" "}
            {(rate * 100).toFixed(2)}%.
          </p>
          <div className="rules-grid">
            <div className="rule-item">
              <div className="rule-icon">
                <Crosshair size={14} />
              </div>
              <div>
                <h3>Score</h3>
                <p>{ui.score.toLocaleString()} pts</p>
              </div>
            </div>
            <div className="rule-item">
              <div className="rule-icon">
                <Shield size={14} />
              </div>
              <div>
                <h3>Safety restored</h3>
                <p>
                  +{ui.lastConversion.toFixed(1)} → {ui.safety.toFixed(1)} / 100
                </p>
              </div>
            </div>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                sim.unlockAudio();
                sim.nextLevel();
              }}
            >
              Next sector
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (ui.mode === "gameOver") {
    return (
      <div className="overlay-screen">
        <div className="overlay-card">
          <h1 className="overlay-title">Safety depleted</h1>
          <p className="overlay-subtitle">
            Starship lost. Final score {ui.score.toLocaleString()} · Best{" "}
            {ui.highScore.toLocaleString()}
          </p>
          <div className="rules-grid">
            <div className="rule-item">
              <div className="rule-icon">
                <Rocket size={14} />
              </div>
              <div>
                <h3>Sector reached</h3>
                <p>Level {ui.level}</p>
              </div>
            </div>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                sim.unlockAudio();
                sim.startGame();
              }}
            >
              Relaunch
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => sim.returnToDemo()}
            >
              Demo
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (ui.mode === "paused") {
    return (
      <div className="overlay-screen">
        <div className="overlay-card" style={{ maxWidth: 400 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 4,
            }}
          >
            <h1 className="overlay-title" style={{ fontSize: "1.6rem", margin: 0 }}>
              Paused
            </h1>
            <FullscreenBtn
              isFullscreen={isFullscreen}
              onToggle={
                onToggleFullscreen
                  ? () => {
                      sim.unlockAudio();
                      onToggleFullscreen();
                    }
                  : undefined
              }
            />
          </div>
          <p className="overlay-subtitle">
            Systems holding. Adjust cockpit audio below, then resume.
          </p>
          <AudioSettingsPanel
            settings={audioSettings}
            onChange={onAudioChange}
            compact
          />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => sim.togglePause()}
            >
              Resume
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => sim.returnToDemo()}
            >
              Abort to demo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-screen">
      <div className="overlay-card">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontSize: "0.72rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--color-accent)",
              fontWeight: 600,
            }}
          >
            GPU Asteroids
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <FullscreenBtn
              isFullscreen={isFullscreen}
              onToggle={
                onToggleFullscreen
                  ? () => {
                      sim.unlockAudio();
                      onToggleFullscreen();
                    }
                  : undefined
              }
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{
                minHeight: 40,
                padding: "8px 12px",
                fontSize: "0.78rem",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => {
                sim.unlockAudio();
                onOpenAudio();
              }}
              aria-label="Audio settings"
            >
              <Settings2 size={14} />
              Audio
            </button>
          </div>
        </div>
        <h1 className="overlay-title">Starship Gravity</h1>
        <p className="overlay-subtitle">
          A modernized 3D Asteroids with mutual Newtonian gravity, a Safety
          meter instead of lives, and Claude — mobile, unpredictable, and armed
          only with “helpful” physics… for safety.
        </p>

        <div
          style={{
            fontSize: "0.8rem",
            color: "var(--color-subtle)",
            marginBottom: 16,
            fontStyle: "italic",
            minHeight: "1.2em",
          }}
        >
          {ui.demoCaption}
        </div>

        <div className="rules-grid">
          <div className="rule-item">
            <div className="rule-icon">
              <Shield size={14} />
            </div>
            <div>
              <h3>Safety = 100</h3>
              <p>
                No spare ships. Collisions drain Safety. Near-field asteroid
                explosions you can hear also nick the hull.
              </p>
            </div>
          </div>
          <div className="rule-item">
            <div className="rule-icon">
              <Crosshair size={14} />
            </div>
            <div>
              <h3>1,000 pts per full kill</h3>
              <p>
                Shatter every fragment of an asteroid lineage to score. Partial
                hits split rocks but only a complete wipe pays out.
              </p>
            </div>
          </div>
          <div className="rule-item">
            <div className="rule-icon">
              <Atom size={14} />
            </div>
            <div>
              <h3>Mutual gravity</h3>
              <p>
                Mass pulls mass with a single consistent force law. Trajectories
                curve; vacuum has no ambient drag. Rocks ricochet off each
                other, bullets, and the ship.
              </p>
            </div>
          </div>
          <div className="rule-item">
            <div className="rule-icon">
              <Bot size={14} />
            </div>
            <div>
              <h3>Claude aliens</h3>
              <p>
                One on sector 1; +1 max every 10 levels. Claude doesn't
                shoot — it warps physics "for safety." Contradictory
                Claudes stay apart; zones may still brush.
              </p>
            </div>
          </div>
          <div className="rule-item">
            <div className="rule-icon">
              <Rocket size={14} />
            </div>
            <div>
              <h3>Cockpit audio</h3>
              <p>
                Suit breathing, thruster rumble, and cannon fire — toggle and
                mix them in Audio settings.
              </p>
            </div>
          </div>
          <div className="rule-item">
            <div className="rule-icon">
              <Keyboard size={14} />
            </div>
            <div>
              <h3>Controls</h3>
              <p>
                Keyboard: A/D or ←/→ rotate · W/↑ engines · S/↓ retros · Space
                fire · P pause. Gamepad: left stick / D-pad move · A/B/RB fire ·
                RT/Y thrust · LT/X/LB retro · Start pause. Touch pads hold for
                continuous control.
              </p>
            </div>
          </div>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              sim.unlockAudio();
              sim.startGame();
            }}
          >
            Launch Starship
          </button>
        </div>

        {ui.highScore > 0 && (
          <div
            style={{
              marginTop: 12,
              fontSize: "0.78rem",
              color: "var(--color-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Best {ui.highScore.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
