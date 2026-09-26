import { EyeIcon } from './icons.jsx';

const primaryBtn =
  'w-full rounded-3xl bg-accent font-extrabold text-accent-ink active:brightness-90 disabled:opacity-60 focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none';
const secondaryBtn =
  'w-full rounded-3xl bg-white/15 font-bold text-white active:bg-white/25 disabled:opacity-60 focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none';

/**
 * First launch asks how announcements should be read (our voice vs. the
 * user's screen reader) so the two never talk over each other. Later
 * launches: one Start button, and a tap anywhere also starts.
 */
export default function StartScreen({
  firstRun,
  mode,
  onStart,
  starting,
  cameraError,
  detectorStatus,
  detectorError,
  onRetryModel,
}) {
  const modelText =
    detectorStatus === 'ready'
      ? 'Vision model ready'
      : detectorStatus === 'error'
        ? detectorError
        : 'Loading Vision Model…';

  const tapAnywhere = (e) => {
    if (firstRun || starting || e.target.closest('button')) return;
    onStart();
  };

  return (
    <section
      className="pt-safe pb-safe absolute inset-0 flex flex-col overflow-y-auto bg-black px-6"
      aria-labelledby="app-title"
      onClick={tapAnywhere}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-accent text-accent-ink">
            <EyeIcon className="h-11 w-11" />
          </div>
          <h1 id="app-title" className="text-4xl font-extrabold tracking-tight">
            ProprioSys
          </h1>
          <p className="text-lg text-white/80">
            Point your phone ahead. ProprioSys speaks the objects it sees, where they are, and vibrates when something
            is very close.
          </p>
        </div>

        <ul className="space-y-3 text-base text-white/75">
          <li>• Hold the phone upright at chest height, camera facing forward.</li>
          <li>• Tap anywhere on the screen to hear everything in view.</li>
          <li>• Runs entirely on your device — no images leave your phone.</li>
        </ul>

        {cameraError && (
          <p role="alert" className="rounded-2xl bg-red-500/90 px-4 py-3 text-base font-medium">
            {cameraError}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {firstRun ? (
            <>
              <p id="voice-question" className="text-center text-lg font-semibold">
                How should announcements be read?
              </p>
              <button
                type="button"
                onClick={() => onStart('app')}
                disabled={starting}
                autoFocus
                aria-describedby="voice-question"
                className={`${primaryBtn} min-h-20 px-4 text-xl`}
              >
                Start with ProprioSys voice
              </button>
              <button
                type="button"
                onClick={() => onStart('screenreader')}
                disabled={starting}
                aria-describedby="voice-question"
                className={`${secondaryBtn} min-h-16 px-4 text-lg`}
              >
                Start with my screen reader
              </button>
              <p className="text-center text-sm text-white/60">
                Choose “my screen reader” if you use TalkBack or VoiceOver. You can change this later in Settings.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onStart()}
                disabled={starting}
                autoFocus
                className={`${primaryBtn} h-20 text-2xl`}
              >
                {starting ? 'Starting camera…' : cameraError ? 'Try again' : mode === 'canvas' ? 'Start Canvas' : 'Start'}
              </button>
              <p className="text-center text-sm text-white/60" aria-hidden="true">
                Or tap anywhere on the screen.
              </p>
            </>
          )}
          <p className="flex items-center justify-center gap-2 text-sm text-white/60">
            <span
              className={`h-2 w-2 rounded-full ${
                detectorStatus === 'ready'
                  ? 'bg-green-400'
                  : detectorStatus === 'error'
                    ? 'bg-red-400'
                    : 'animate-pulse bg-accent'
              }`}
              aria-hidden="true"
            />
            {modelText}
            {detectorStatus === 'error' && (
              <button type="button" onClick={onRetryModel} className="font-semibold text-accent underline">
                Retry
              </button>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
