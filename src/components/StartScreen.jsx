import { EyeIcon } from './icons.jsx';

export default function StartScreen({ onStart, starting, cameraError, detectorStatus, detectorError, onRetryModel }) {
  const modelText =
    detectorStatus === 'ready'
      ? 'Detection model ready'
      : detectorStatus === 'error'
        ? detectorError
        : 'Downloading detection model…';

  return (
    <section
      className="pt-safe pb-safe absolute inset-0 flex flex-col overflow-y-auto bg-black px-6"
      aria-labelledby="app-title"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-accent text-accent-ink">
            <EyeIcon className="h-11 w-11" />
          </div>
          <h1 id="app-title" className="text-4xl font-extrabold tracking-tight">
            SightLine
          </h1>
          <p className="text-lg text-white/80">
            Point your phone ahead. SightLine speaks the objects it sees, where they are, and vibrates when something is
            very close.
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
          <button
            type="button"
            onClick={onStart}
            disabled={starting}
            autoFocus
            className="h-20 w-full rounded-3xl bg-accent text-2xl font-extrabold text-accent-ink active:brightness-90 disabled:opacity-60 focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none"
          >
            {starting ? 'Starting camera…' : cameraError ? 'Try again' : 'Start'}
          </button>
          <p role="status" className="flex items-center justify-center gap-2 text-sm text-white/60">
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
