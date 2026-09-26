import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from './hooks/useCamera.js';
import { useDetector } from './hooks/useDetector.js';
import { useDetectionLoop } from './hooks/useDetectionLoop.js';
import { useWakeLock } from './hooks/useWakeLock.js';
import { useSettings } from './hooks/useSettings.js';
import { Announcer, VERBOSITY, describeScene } from './lib/announcer.js';
import { speaker } from './lib/speech.js';
import { haptics } from './lib/haptics.js';
import { clearCanvas, drawDetections } from './lib/draw.js';
import StartScreen from './components/StartScreen.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import { GearIcon, PauseIcon, PlayIcon } from './components/icons.jsx';

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const announcerRef = useRef(null);
  if (!announcerRef.current) announcerRef.current = new Announcer();
  const latestRef = useRef({ preds: [], w: 0, h: 0 });
  const statsRef = useRef({ frames: 0, ms: 0, since: 0 });

  const [settings, updateSettings] = useSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    announcerRef.current.configure(VERBOSITY[settings.verbosity] ?? VERBOSITY.normal);
    if (!settings.showBoxes) clearCanvas(canvasRef.current);
  }, [settings]);

  const camera = useCamera(videoRef);
  const detector = useDetector();
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [caption, setCaption] = useState('');
  const [stats, setStats] = useState({ fps: 0, ms: 0 });

  const live = started && camera.status === 'ready';
  const running = live && !paused && detector.status === 'ready';
  useWakeLock(live && !paused);

  const onFrame = useCallback((preds, inferMs) => {
    const video = videoRef.current;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const s = settingsRef.current;
    const now = performance.now();
    latestRef.current = { preds, w, h };

    if (s.showBoxes) drawDetections(canvasRef.current, video, preds);

    const announcer = announcerRef.current;
    const plan = announcer.evaluate(preds, w, h, now);
    if (plan) {
      const delivered = s.speech ? speaker.say(plan.text, { urgent: plan.urgent, rate: s.rate }) : true;
      if (delivered) {
        announcer.commit(plan, now);
        setCaption(plan.text);
        if (s.haptics && plan.haptic) haptics.pulse(plan.haptic, plan.urgent ? 0 : 600);
      }
    }

    const st = statsRef.current;
    st.frames++;
    st.ms += inferMs;
    if (now - st.since >= 1000) {
      setStats({
        fps: Math.round((st.frames * 1000) / (now - st.since)),
        ms: Math.round(st.ms / st.frames),
      });
      statsRef.current = { frames: 0, ms: 0, since: now };
    }
  }, []);

  useDetectionLoop({
    enabled: running,
    model: detector.model,
    videoRef,
    minScore: settings.minScore,
    onFrame,
  });

  // Reset transient state whenever detection stops.
  useEffect(() => {
    if (running) return;
    clearCanvas(canvasRef.current);
    announcerRef.current.reset();
    latestRef.current = { preds: [], w: 0, h: 0 };
    statsRef.current = { frames: 0, ms: 0, since: performance.now() };
  }, [running]);

  // Silence speech when the app is backgrounded.
  useEffect(() => {
    const onVis = () => document.hidden && speaker.cancel();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const handleStart = async () => {
    // All three of these need to happen inside the user gesture on iOS.
    speaker.unlock();
    haptics.pulse([20], 0);
    setStarted(true);
    setPaused(false);
    await camera.start();
  };

  const describe = () => {
    if (!running) return;
    const { preds, w, h } = latestRef.current;
    const text = describeScene(preds, w, h);
    setCaption(text);
    if (settings.speech) speaker.say(text, { urgent: true, rate: settings.rate });
    if (settings.haptics) haptics.pulse([30], 0);
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    speaker.cancel();
    if (next) {
      setCaption('Paused');
      if (settings.speech) speaker.say('Paused', { urgent: true, rate: settings.rate });
    } else {
      setCaption('');
    }
  };

  const showStart = !live;
  const statusText =
    detector.status === 'loading'
      ? 'Loading model…'
      : detector.status === 'error'
        ? 'Model error'
        : paused
          ? 'Paused'
          : `${stats.fps} fps · ${stats.ms} ms · ${detector.backend}`;

  return (
    <main className="relative h-full w-full overflow-hidden bg-black select-none">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />

      {/* Whole-screen tap target: the most reliable gesture for a blind user. */}
      {live && (
        <button
          type="button"
          onClick={describe}
          className="absolute inset-0 h-full w-full cursor-pointer focus:outline-none"
          aria-label="Describe everything in view"
        />
      )}

      {live && (
        <>
          <header className="pt-safe pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-8">
            <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium tabular-nums backdrop-blur">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  running ? 'bg-green-400' : detector.status === 'error' ? 'bg-red-400' : 'bg-accent'
                }`}
                aria-hidden="true"
              />
              <span role="status">{statusText}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-black/60 backdrop-blur focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none"
              aria-label="Settings"
            >
              <GearIcon className="h-6 w-6" />
            </button>
          </header>

          <footer className="pb-safe pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pt-16">
            {detector.status === 'error' && (
              <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-red-500/90 px-4 py-3 text-base font-medium">
                <span>{detector.error}</span>
                <button type="button" onClick={detector.retry} className="rounded-full bg-black/30 px-4 py-2 font-semibold">
                  Retry
                </button>
              </div>
            )}

            {/* Screen-reader users who turn off the built-in voice get announcements via aria-live instead. */}
            <p
              aria-live={settings.speech ? 'off' : 'polite'}
              className="min-h-[3.5rem] text-center text-xl leading-snug font-semibold text-balance drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
            >
              {caption || (running ? 'Scanning… tap anywhere for a full description.' : '')}
            </p>

            <div className="pointer-events-auto flex items-stretch gap-3">
              <button
                type="button"
                onClick={togglePause}
                className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur active:bg-white/25 focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none"
                aria-label={paused ? 'Resume detection' : 'Pause detection'}
                aria-pressed={paused}
              >
                {paused ? <PlayIcon className="h-7 w-7" /> : <PauseIcon className="h-7 w-7" />}
              </button>
              <button
                type="button"
                onClick={describe}
                disabled={!running}
                className="h-16 flex-1 rounded-2xl bg-accent text-lg font-bold text-accent-ink active:brightness-90 disabled:opacity-40 focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none"
              >
                Describe scene
              </button>
            </div>
          </footer>
        </>
      )}

      {showStart && (
        <StartScreen
          onStart={handleStart}
          starting={camera.status === 'starting'}
          cameraError={camera.error}
          detectorStatus={detector.status}
          detectorError={detector.error}
          onRetryModel={detector.retry}
        />
      )}

      {showSettings && (
        <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
    </main>
  );
}
