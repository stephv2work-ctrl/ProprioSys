import { useEffect, useRef } from 'react';
import { haptics } from '../lib/haptics.js';
import { speaker } from '../lib/speech.js';

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
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}

export default function SettingsSheet({ settings, onChange, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        className="pb-safe max-h-[85%] w-full overflow-y-auto rounded-t-3xl bg-neutral-900 px-5 pt-4"
      >
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <h2 id="settings-title" className="text-2xl font-bold">
              Settings
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/10 px-5 py-2.5 font-semibold focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none"
            >
              Done
            </button>
          </div>

          <div className="mt-2 divide-y divide-white/10">
            <Toggle
              label="Spoken descriptions"
              hint={speaker.supported ? 'Turn off to use your screen reader instead' : 'Not supported in this browser'}
              checked={settings.speech && speaker.supported}
              disabled={!speaker.supported}
              onChange={(v) => onChange({ speech: v })}
            />
            <Toggle
              label="Haptic feedback"
              hint={haptics.supported ? 'Strong pulse when something is very close' : 'Not supported on this device'}
              checked={settings.haptics && haptics.supported}
              disabled={!haptics.supported}
              onChange={(v) => onChange({ haptics: v })}
            />
            <Toggle
              label="Show boxes"
              hint="Draw detections over the camera view"
              checked={settings.showBoxes}
              onChange={(v) => onChange({ showBoxes: v })}
            />

            <fieldset className="py-3">
              <legend className="text-lg font-medium">How often to speak</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {['low', 'normal', 'high'].map((v) => (
                  <label
                    key={v}
                    className="cursor-pointer rounded-xl bg-white/10 py-3 text-center font-semibold capitalize has-[:checked]:bg-accent has-[:checked]:text-accent-ink has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/50"
                  >
                    <input
                      type="radio"
                      name="verbosity"
                      value={v}
                      checked={settings.verbosity === v}
                      onChange={() => onChange({ verbosity: v })}
                      className="sr-only"
                    />
                    {v}
                  </label>
                ))}
              </div>
            </fieldset>

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
          <p className="py-4 text-sm text-white/50">
            Detects 80 everyday object types (people, vehicles, furniture, animals…). Distance is estimated from object
            size and is approximate — not a substitute for a cane or guide.
          </p>
        </div>
      </div>
    </div>
  );
}
