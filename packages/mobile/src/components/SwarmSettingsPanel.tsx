import type { SwarmSettings } from "../types/swarm";

export function SwarmSettingsPanel({
  settings,
  onChange,
}: {
  settings: SwarmSettings;
  onChange: (s: SwarmSettings) => void;
}) {
  const num = (key: keyof SwarmSettings, min: number, max: number) => (
    <input
      type="number"
      className="setting-num"
      min={min}
      max={max}
      value={settings[key] as number}
      onChange={(e) => onChange({ ...settings, [key]: Number(e.target.value) })}
    />
  );
  const text = (key: keyof SwarmSettings) => (
    <input
      type="text"
      className="setting-text"
      value={settings[key] as string}
      onChange={(e) => onChange({ ...settings, [key]: e.target.value })}
    />
  );
  const toggle = (key: keyof SwarmSettings, label: string) => (
    <label className="setting-toggle">
      <span>{label}</span>
      <div
        className={`toggle-switch ${settings[key] ? "on" : ""}`}
        onClick={() => onChange({ ...settings, [key]: !settings[key] })}
      >
        <div className="toggle-knob" />
      </div>
    </label>
  );

  return (
    <div className="card settings-card">
      <h2>Swarm Settings</h2>
      <div className="settings-grid">
        <div className="setting-row">
          <span>Max Workers</span>
          {num("maxWorkers", 1, 10)}
        </div>
        <div className="setting-row">
          <span>Base Branch</span>
          {text("baseBranch")}
        </div>
        <div className="setting-row">
          <span>Timeout (min)</span>
          {num("timeoutMinutes", 5, 120)}
        </div>
        <div className="setting-row">
          <span>Max Retries</span>
          {num("maxRetries", 0, 5)}
        </div>
      </div>
      {toggle("claudeSkipPermissions", "Skip Permissions")}
      {toggle("claudeInteractive", "Interactive Mode")}
    </div>
  );
}
