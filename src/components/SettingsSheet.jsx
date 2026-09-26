import { haptics } from '../lib/haptics.js';
import { speaker } from '../lib/speech.js';
import { mediaButtons } from '../lib/mediaButtons.js';
import { DEPTH_MODELS, OBJECT_MODELS } from '../lib/models.js';
import Sheet from './Sheet.jsx';

function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`flex items-center justify-between gap-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
      <span>
        <span className="block text-lg font-medium">{label}</span>
        {hint && <span className="block text-sm text-white/60">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-white/20 transition-colors before:block before:h-6 before:w-6 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-accent checked:before:translate-x-[1.35rem] focus-visible:ring-4 focus-visible:ring-accent/50 focus-visible:outline-none"
      />
    </label>
  );
}

function Slider({ label, value, display, min, max, step, onChange }) {
  return (
    <label className="block py-3">
      <span className="flex justify-between text-lg font-medium">
        {label} <span className="tabular-nums text-white/70">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}

function ModelPicker({ legend, name, models, value, onChange }) {
  return (
    <fieldset className="py-3">
      <legend className="text-lg font-medium">{legend}</legend>
      <div className="mt-2 space-y-2">
        {models.map((m) => (
          <label
            key={m.id}
            className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/10 p-3 has-[:checked]:bg-accent has-[:checked]:text-accent-ink has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/50"
          >
            <input
              type="radio"
              name={name}
              value={m.id}
              checked={value === m.id}
              onChange={() => onChange(m.id)}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent-ink)]"
            />
            <span>
              <span className="block font-semibold">{m.label}</span>
              <span className="block text-sm opacity-80">{m.detail}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function depthStatusText(depth) {
  if (depth.status === 'loading') return `Downloading… ${depth.progress}%`;
  if (depth.status === 'error') return depth.error;
  if (depth.status !== 'ready') return null;
  return depth.device === 'webgpu'
    ? 'Ready. Used in Canvas mode; measuring takes about a second.'
    : 'Ready, but this phone lacks WebGPU, so measuring can take up to 30 seconds per photo.';
}

export default function SettingsSheet({ settings, onChange, onVoiceChange, depth, onClose }) {
  const depthStatus = depthStatusText(depth);
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="mt-2 divide-y divide-white/10">
        <ModelPicker
          legend="Object model"
          name="objectModel"
          models={OBJECT_MODELS}
          value={settings.objectModel}
          onChange={(id) => onChange({ objectModel: id })}
        />
        <div className="py-3">
          <ModelPicker
            legend="Distance model (Canvas mode)"
            name="depthModel"
            models={DEPTH_MODELS}
            value={settings.depthModel}
            onChange={(id) => onChange({ depthModel: id })}
          />
          {depthStatus && (
            <p className="flex items-center justify-between gap-3 text-sm text-white/75">
              <span>{depthStatus}</span>
              {depth.status === 'error' && (
                <button type="button" onClick={depth.retry} className="min-h-10 rounded-full bg-white/15 px-4 font-semibold">
                  Retry
                </button>
              )}
            </p>
          )}
        </div>
        <Toggle
          label="ProprioSys voice"
          hint={
            speaker.supported
              ? 'Off: your screen reader (TalkBack or VoiceOver) reads announcements instead'
              : 'Not supported in this browser. Announcements go to your screen reader.'
          }
          checked={settings.speech && speaker.supported}
          disabled={!speaker.supported}
          onChange={onVoiceChange}
        />
        <Toggle
          label="Haptic feedback"
          hint={haptics.supported ? 'Strong buzz when something is very close' : 'Not supported on this device'}
          checked={settings.haptics && haptics.supported}
          disabled={!haptics.supported}
          onChange={(v) => onChange({ haptics: v })}
        />
        <Toggle
          label="Earbud button controls"
          hint={
            mediaButtons.supported
              ? 'Play/pause on your earbuds describes or captures. May pause other audio apps.'
              : 'Not supported in this browser'
          }
          checked={settings.earbuds && mediaButtons.supported}
          disabled={!mediaButtons.supported}
          onChange={(v) => {
            onChange({ earbuds: v });
            if (v) mediaButtons.start();
            else mediaButtons.stop();
          }}
        />
        <Toggle
          label="Show boxes"
          hint="Draw detections over the camera view"
          checked={settings.showBoxes}
          onChange={(v) => onChange({ showBoxes: v })}
        />

        <fieldset className="py-3">
          <legend className="text-lg font-medium">How much to say</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ['low', 'Quiet'],
              ['normal', 'Normal'],
              ['high', 'Detailed'],
            ].map(([v, text]) => (
              <label
                key={v}
                className="cursor-pointer rounded-xl bg-white/10 py-3 text-center font-semibold has-[:checked]:bg-accent has-[:checked]:text-accent-ink has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/50"
              >
                <input
                  type="radio"
                  name="verbosity"
                  value={v}
                  checked={settings.verbosity === v}
                  onChange={() => onChange({ verbosity: v })}
                  className="sr-only"
                />
                {text}
              </label>
            ))}
          </div>
        </fieldset>

        <Slider
          label="Voice volume"
          value={settings.volume}
          display={`${Math.round(settings.volume * 100)}%`}
          min={0.2}
          max={1}
          step={0.05}
          onChange={(v) => onChange({ volume: v })}
        />
        <Slider
          label="Speech rate"
          value={settings.rate}
          display={`${settings.rate.toFixed(1)}×`}
          min={0.7}
          max={1.8}
          step={0.1}
          onChange={(v) => onChange({ rate: v })}
        />
        <Slider
          label="Minimum confidence"
          value={settings.minScore}
          display={`${Math.round(settings.minScore * 100)}%`}
          min={0.3}
          max={0.9}
          step={0.05}
          onChange={(v) => onChange({ minScore: v })}
        />
      </div>
      <p className="py-4 text-sm text-white/60">
        Detects 80 everyday object types (people, vehicles, furniture, animals…). Distance is estimated from object
        size and is approximate — not a substitute for a cane or guide.
      </p>
    </Sheet>
  );
}
