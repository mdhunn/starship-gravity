import type { AudioChannelSettings } from "../audio/SoundEngine";

function ChannelRow({
  label,
  description,
  enabled,
  volume,
  onToggle,
  onVolume,
}: {
  label: string;
  description: string;
  enabled: boolean;
  volume: number;
  onToggle: (v: boolean) => void;
  onVolume: (v: number) => void;
}) {
  return (
    <div className="audio-row">
      <div className="audio-row-head">
        <label className="audio-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="audio-toggle-ui" aria-hidden />
          <span className="audio-label">{label}</span>
        </label>
        <span className="audio-vol-readout">
          {enabled ? `${Math.round(volume * 100)}%` : "Off"}
        </span>
      </div>
      <p className="audio-desc">{description}</p>
      <input
        type="range"
        className="audio-slider"
        min={0}
        max={100}
        step={1}
        disabled={!enabled}
        value={Math.round(volume * 100)}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
        aria-label={`${label} volume`}
      />
    </div>
  );
}

export function AudioSettingsPanel({
  settings,
  onChange,
  compact,
}: {
  settings: AudioChannelSettings;
  onChange: (partial: Partial<AudioChannelSettings>) => void;
  compact?: boolean;
}) {
  return (
    <div className={`audio-panel${compact ? " audio-panel-compact" : ""}`}>
      <div className="audio-panel-title">Cockpit audio</div>
      <ChannelRow
        label="Thrusters"
        description="Engine rumble while main engines or retros are firing."
        enabled={settings.thrusterEnabled}
        volume={settings.thrusterVolume}
        onToggle={(thrusterEnabled) => onChange({ thrusterEnabled })}
        onVolume={(thrusterVolume) => onChange({ thrusterVolume })}
      />
      <ChannelRow
        label="Cannon"
        description="Weapon fire crack for each shot."
        enabled={settings.cannonEnabled}
        volume={settings.cannonVolume}
        onToggle={(cannonEnabled) => onChange({ cannonEnabled })}
        onVolume={(cannonVolume) => onChange({ cannonVolume })}
      />
      <ChannelRow
        label="Suit breathing"
        description="Helmet mic breathing — rate rises with sector stress."
        enabled={settings.breathEnabled}
        volume={settings.breathVolume}
        onToggle={(breathEnabled) => onChange({ breathEnabled })}
        onVolume={(breathVolume) => onChange({ breathVolume })}
      />
    </div>
  );
}
