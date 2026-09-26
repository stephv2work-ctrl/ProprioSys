import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from './hooks/useCamera.js';
import { useDetector } from './hooks/useDetector.js';
import { useDepthModel } from './hooks/useDepthModel.js';
import { getObjectModel } from './lib/models.js';
import { useDetectionLoop } from './hooks/useDetectionLoop.js';
import { useWakeLock } from './hooks/useWakeLock.js';
import { useSettings } from './hooks/useSettings.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { Announcer, VERBOSITY, describeScene } from './lib/announcer.js';
import { speaker } from './lib/speech.js';
import { haptics } from './lib/haptics.js';
import { srAnnounce } from './lib/screenReader.js';
import { mediaButtons } from './lib/mediaButtons.js';
import { INTRO } from './lib/guide.js';
import { updates } from './lib/updates.js';
import { clearCanvas, drawDetections } from './lib/draw.js';
import StartScreen from './components/StartScreen.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import HelpSheet from './components/HelpSheet.jsx';
import CanvasMode from './components/CanvasMode.jsx';
import LiveRegions from './components/LiveRegions.jsx';
import { GearIcon, PauseIcon, PlayIcon } from './components/icons.jsx';

const MODES = [
  ['live', 'Live'],
  ['canvas', 'Canvas'],
];

// Home-screen shortcuts (manifest) open /?mode=canvas.
const initialMode = () => (new URLSearchParams(window.location.search).get('mode') === 'canvas' ? 'canvas' : 'live');

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasControlsRef = useRef(null);
  const modeButtonsRef = useRef({});
  const announcerRef = useRef(null);
  if (!announcerRef.current) announcerRef.current = new Announcer();
  const latestRef = useRef({ preds: [], w: 0, h: 0 });
  const statsRef = useRef({ frames: 0, ms: 0, since: 0 });
  const quietUntilRef = useRef(0); // holds live announcements while the screen reader reads the tutorial
  const tapsRef = useRef([]); // recent whole-screen taps, for the triple-tap "voice on" gesture

  const [settings, updateSettings] = useSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    announcerRef.current.configure(VERBOSITY[settings.verbosity] ?? VERBOSITY.normal);
    if (!settings.showBoxes) clearCanvas(canvasRef.current);
  }, [settings]);

  const camera = useCamera(videoRef);
  const detector = useDetector(getObjectModel(settings.objectModel).base);
  const depth = useDepthModel(settings.depthModel);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sheet, setSheet] = useState(null); // null | 'settings' | 'help'
  const [mode, setMode] = useState(initialMode);
  const [caption, setCaption] = useState('');
  const [stats, setStats] = useState({ fps: 0, ms: 0 });

  const live = started && camera.status === 'ready';
  const running = live && mode === 'live' && !paused && detector.status === 'ready';
  // Pause only applies to Live mode; Canvas keeps the screen on.
  useWakeLock(live && (mode === 'canvas' || !paused));

  /** One output path: our voice, or the user's screen reader — never both. */
  const say = useCallback((text, { urgent = false } = {}) => {
    const s = settingsRef.current;
    if (s.speech && speaker.supported) return speaker.say(text, { urgent, rate: s.rate });
    srAnnounce(text, { urgent });
    return true;
  }, []);

  const onFrame = useCallback(
    (preds, inferMs) => {
      const video = videoRef.current;
      const w = video.videoWidth;
      const h = video.videoHeight;
      const s = settingsRef.current;
      const now = performance.now();
      latestRef.current = { preds, w, h };

      if (s.showBoxes) drawDetections(canvasRef.current, video, preds);

      const announcer = announcerRef.current;
      const plan = now < quietUntilRef.current ? null : announcer.evaluate(preds, w, h, now);
      if (plan && say(plan.text, { urgent: plan.urgent })) {
        announcer.commit(plan, now);
        setCaption(plan.text);
        if (s.haptics && plan.haptic) haptics.pulse(plan.haptic, plan.urgent ? 0 : 600);
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
    },
    [say],
  );

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

  // Spoken model status, so blind users know why nothing is announced yet.
  // (The visual status pill is deliberately *not* a live region: it changes every second.)
  const statusSaidRef = useRef(null);
  useEffect(() => {
    if (!live) return;
    const prev = statusSaidRef.current;
    statusSaidRef.current = detector.status;
    if (detector.status === 'loading' && prev !== 'loading') say('Loading the vision model. One moment.');
    else if (detector.status === 'ready' && prev && prev !== 'ready') say('Vision model ready.');
    else if (detector.status === 'error' && prev !== 'error') say(detector.error, { urgent: true });
  }, [live, detector.status, detector.error, say]);

  // Announce once when a chosen distance model finishes downloading (or fails).
  const depthSaidRef = useRef(depth.status);
  useEffect(() => {
    const prev = depthSaidRef.current;
    depthSaidRef.current = depth.status;
    if (prev !== 'loading') return;
    if (depth.status === 'ready') say('Distance model ready.');
    else if (depth.status === 'error') say(depth.error, { urgent: true });
  }, [depth.status, depth.error, say]);

  // A new version activated in the background. Reloading now would stop the
  // camera mid-use, so wait until the app is idle: on the start screen, or hidden.
  const [updateReady, setUpdateReady] = useState(updates.isPending);
  useEffect(() => updates.subscribe(() => setUpdateReady(true)), []);
  useEffect(() => {
    if (!updateReady) return;
    if (!live) {
      window.location.reload();
      return;
    }
    say('An update is ready. It will install the next time you open the app.');
    const onHide = () => document.hidden && window.location.reload();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [updateReady, live, say]);

  // First-run tutorial, once the camera is live.
  useEffect(() => {
    if (!live || settings.tutorialDone) return;
    updateSettings({ tutorialDone: true });
    if (settings.speech && speaker.supported) speaker.sequence(INTRO, { rate: settings.rate });
    else {
      const text = INTRO.join(' ');
      srAnnounce(text);
      // Screen readers may cut off a live region that changes mid-sentence; ~60 ms per character.
      quietUntilRef.current = performance.now() + text.length * 60;
    }
  }, [live, settings.tutorialDone, settings.speech, settings.rate, updateSettings]);

  const handleStart = async (choice) => {
    const useVoice = choice ? choice === 'app' : settings.speech;
    if (choice) updateSettings({ voiceChosen: true, speech: useVoice });
    // Speech, vibration and media playback all need to begin inside the user gesture on iOS.
    if (useVoice) speaker.unlock();
    haptics.pulse([20], 0);
    if (settings.earbuds) mediaButtons.start();
    setStarted(true);
    setPaused(false);
    await camera.start();
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    // Turn the camera itself off while paused, so its light matches what the user expects.
    camera.setEnabled(!next);
    speaker.cancel();
    setCaption(next ? 'Paused. Camera off.' : '');
    say(next ? 'Paused. Camera off.' : 'Resumed', { urgent: true });
  };

  /** Switching the voice off can leave a user without a screen reader in silence, so say how to undo it first. */
  const setVoice = (on) => {
    const rate = settingsRef.current.rate;
    if (on) {
      updateSettings({ speech: true });
      speaker.unlock();
      speaker.say('Voice on.', { urgent: true, rate });
    } else {
      speaker.say(
        'Voice off. Announcements now go to your screen reader. To turn the voice back on, tap the screen three times quickly in Live mode, or press V.',
        { urgent: true, rate },
      );
      updateSettings({ speech: false });
    }
  };

  const onScreenTap = () => {
    if (!settingsRef.current.speech && speaker.supported) {
      const now = performance.now();
      tapsRef.current = [...tapsRef.current.filter((t) => now - t < 1200), now];
      if (tapsRef.current.length >= 3) {
        tapsRef.current = [];
        setVoice(true);
        return;
      }
    }
    describe();
  };

  const describe = () => {
    if (paused) {
      togglePause();
      return;
    }
    if (!running) return;
    const { preds, w, h } = latestRef.current;
    const text = describeScene(preds, w, h);
    setCaption(text);
    say(text, { urgent: true });
    if (settings.haptics) haptics.pulse([30], 0);
  };

  const switchMode = (next) => {
    if (next === mode) return;
    speaker.cancel();
    setCaption('');
    // Pause belongs to Live mode; leaving it resumes the camera so Canvas can capture.
    if (paused) {
      setPaused(false);
      camera.setEnabled(true);
    }
    setMode(next);
    say(next === 'canvas' ? 'Canvas mode. Tap Capture to take a photo.' : 'Live mode.', { urgent: true });
  };

  // Arrow keys move between the two mode radios, per the ARIA radio group pattern.
  const onModeKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = mode === 'live' ? 'canvas' : 'live';
    switchMode(next);
    modeButtonsRef.current[next]?.focus();
  };

  // Shared by earbud buttons and keyboard shortcuts.
  const actions = {
    primary: () => (mode === 'live' ? describe() : canvasControlsRef.current?.primary()),
    pause: () => (mode === 'live' ? togglePause() : canvasControlsRef.current?.togglePlay()),
    // Arrow keys only step through a Canvas walkthrough; in Live there is nothing to step through.
    next: () => mode === 'canvas' && canvasControlsRef.current?.next(),
    prev: () => mode === 'canvas' && canvasControlsRef.current?.prev(),
    // Earbud double press: describe in Live, next item in Canvas.
    earbudNext: () => (mode === 'live' ? describe() : canvasControlsRef.current?.next()),
    toggleVoice: () => setVoice(!settingsRef.current.speech),
    toggleMode: () => switchMode(mode === 'live' ? 'canvas' : 'live'),
    settings: () => setSheet('settings'),
    help: () => setSheet('help'),
  };
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });

  useKeyboardShortcuts({ enabled: live && !sheet, actionsRef });

  useEffect(() => {
    if (!live || !settings.earbuds) return;
    mediaButtons.setHandlers({
      primary: () => actionsRef.current.primary(),
      next: () => actionsRef.current.earbudNext(),
      prev: () => actionsRef.current.prev(),
    });
  }, [live, settings.earbuds]);

  const showStart = !live;
  const statusText =
    detector.status === 'loading'
      ? 'Loading Vision Model…'
      : detector.status === 'error'
        ? 'Model error'
        : mode === 'canvas'
          ? depth.status === 'loading'
            ? `Depth model ${depth.progress}%`
            : depth.status === 'ready'
              ? 'Model loaded · depth on'
              : `Model loaded · ${detector.backend}`
          : paused
            ? 'Paused'
            : `${stats.fps} fps · ${stats.ms} ms · ${detector.backend}`;

  const iconBtn =
    'pointer-events-auto grid h-12 min-w-12 place-items-center rounded-full bg-black/60 px-3 font-semibold backdrop-blur focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none';

  return (
    <main className="relative h-full w-full overflow-hidden bg-black select-none">
      <LiveRegions />
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />

      {/* Whole-screen tap target: the most reliable gesture for a blind user.
          Screen readers can still find it by touch; keyboard users have Space instead. */}
      {live && mode === 'live' && (
        <button
          type="button"
          onClick={onScreenTap}
          tabIndex={-1}
          className="absolute inset-0 h-full w-full cursor-pointer focus:outline-none"
          aria-label="Describe everything in view"
        />
      )}

      {live && mode === 'canvas' && (
        <CanvasMode
          videoRef={videoRef}
          model={detector.model}
          settings={settings}
          controlsRef={canvasControlsRef}
          depth={depth}
        />
      )}

      {live && (
        <>
          <header className="pt-safe pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-8">
            <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium tabular-nums backdrop-blur">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  running || (mode === 'canvas' && detector.status === 'ready')
                    ? 'bg-green-400'
                    : detector.status === 'error'
                      ? 'bg-red-400'
                      : 'bg-accent'
                }`}
                aria-hidden="true"
              />
              <span>{statusText}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSheet('help')} className={iconBtn}>
                Help
              </button>
              <button type="button" onClick={() => setSheet('settings')} className={iconBtn} aria-label="Settings">
                <GearIcon className="h-6 w-6" />
              </button>
            </div>
          </header>

          <div
            role="radiogroup"
            aria-label="Mode"
            onKeyDown={onModeKeyDown}
            className="absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)] left-1/2 grid -translate-x-1/2 grid-cols-2 rounded-full bg-black/60 p-1 backdrop-blur"
          >
            {MODES.map(([value, label]) => (
              <button
                key={value}
                ref={(el) => (modeButtonsRef.current[value] = el)}
                type="button"
                role="radio"
                aria-checked={mode === value}
                tabIndex={mode === value ? 0 : -1}
                onClick={() => switchMode(value)}
                className={`min-w-24 rounded-full px-5 py-2.5 font-semibold focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none ${
                  mode === value ? 'bg-accent text-accent-ink' : 'text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'live' && (
            <footer className="pb-safe pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pt-16">
              {detector.status === 'error' && (
                <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-red-500/90 px-4 py-3 text-base font-medium">
                  <span>{detector.error}</span>
                  <button type="button" onClick={detector.retry} className="rounded-full bg-black/30 px-4 py-2 font-semibold">
                    Retry
                  </button>
                </div>
              )}

              {/* Visual caption only; announcements reach screen readers via LiveRegions. */}
              <p className="min-h-[3.5rem] text-center text-xl leading-snug font-semibold text-balance drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                {caption || (running ? 'Scanning… tap anywhere for a full description.' : '')}
              </p>

              <div className="pointer-events-auto flex items-stretch gap-3">
                <button
                  type="button"
                  onClick={togglePause}
                  aria-pressed={paused}
                  className="flex h-16 w-24 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/15 text-sm font-semibold backdrop-blur active:bg-white/25 focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none"
                >
                  {paused ? <PlayIcon className="h-6 w-6" /> : <PauseIcon className="h-6 w-6" />}
                  {paused ? 'Resume' : 'Pause'}
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
          )}
        </>
      )}

      {showStart && (
        <StartScreen
          firstRun={!settings.voiceChosen}
          voiceOff={!settings.speech}
          mode={mode}
          onStart={handleStart}
          starting={camera.status === 'starting'}
          cameraError={camera.error}
          detectorStatus={detector.status}
          detectorError={detector.error}
          onRetryModel={detector.retry}
        />
      )}

      {sheet === 'settings' && (
        <SettingsSheet
          settings={settings}
          onChange={updateSettings}
          onVoiceChange={setVoice}
          depth={depth}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'help' && <HelpSheet settings={settings} onClose={() => setSheet(null)} />}
    </main>
  );
}
