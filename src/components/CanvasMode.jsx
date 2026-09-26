import { useCallback, useEffect, useRef, useState } from 'react';
import { buildWalkthrough } from '../lib/walkthrough.js';
import { drawSnapshot } from '../lib/draw.js';
import { speaker } from '../lib/speech.js';
import { haptics } from '../lib/haptics.js';
import { srAnnounce } from '../lib/screenReader.js';
import { PauseIcon, PlayIcon } from './icons.jsx';

// COCO-SSD downsamples to 300×300, so the video frame is already more resolution
// than the model can use — grabbing it is instant and avoids ImageCapture quirks.
function captureFrame(video) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  return c;
}

const SWIPE_PX = 50;
const TAP_PX = 15;

export default function CanvasMode({ videoRef, model, settings, controlsRef }) {
  const viewRef = useRef(null);
  const snapRef = useRef(null);
  const seqRef = useRef(null);
  const pointerRef = useRef(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  const [phase, setPhase] = useState('ready'); // ready | analyzing | walkthrough
  const [preds, setPreds] = useState([]);
  const [steps, setSteps] = useState([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);

  const stopSpeech = useCallback(() => {
    seqRef.current?.stop();
    seqRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => () => seqRef.current?.stop(), []);

  const playFrom = useCallback((from, list) => {
    seqRef.current?.stop();
    const s = settingsRef.current;
    setStep(from);
    if (!s.speech || !speaker.supported) {
      // Screen-reader users step through manually; announce where they are.
      seqRef.current = null;
      setPlaying(false);
      const hint = from === 0 && list.length > 1 ? ' Use Next or the step slider to hear each item.' : '';
      srAnnounce(`${list[from].text}${hint}`);
      return;
    }
    setPlaying(true);
    seqRef.current = speaker.sequence(
      list.map((x) => x.text),
      {
        rate: s.rate,
        startAt: from,
        onStep: (i) => {
          setStep(i);
          if (settingsRef.current.haptics) haptics.pulse([30], 0);
        },
        onEnd: () => {
          seqRef.current = null;
          setPlaying(false);
        },
      },
    );
  }, []);

  // Redraw the still whenever the highlighted step or the layout changes.
  useEffect(() => {
    if (phase === 'ready') return;
    const canvas = viewRef.current;
    const draw = () => drawSnapshot(canvas, snapRef.current, preds, steps[step]?.boxes ?? []);
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [phase, preds, steps, step]);

  const capture = async () => {
    const video = videoRef.current;
    if (!model || !video?.videoWidth || phase === 'analyzing') return;
    stopSpeech();
    setError(null);
    if (settings.haptics) haptics.pulse([40], 0);

    snapRef.current = captureFrame(video);
    setPreds([]);
    setSteps([]);
    setPhase('analyzing');
    try {
      const snap = snapRef.current;
      // A still can afford more boxes and a lower threshold than the live loop.
      const result = await model.detect(snap, 30, Math.max(0.3, settings.minScore - 0.15));
      const list = buildWalkthrough(result, snap.width, snap.height);
      setPreds(result);
      setSteps(list);
      setPhase('walkthrough');
      playFrom(0, list);
    } catch (err) {
      console.error(err);
      setError('Could not analyse the photo. Please try again.');
      setPhase('ready');
    }
  };

  const go = (i, { fromSlider = false } = {}) => {
    if (!steps.length) return;
    const n = Math.min(steps.length - 1, Math.max(0, i));
    if (playing) {
      playFrom(n, steps);
      return;
    }
    setStep(n);
    const s = settingsRef.current;
    if (s.speech) speaker.say(steps[n].text, { urgent: true, rate: s.rate });
    // The slider's aria-valuetext is already read by the screen reader.
    else if (!fromSlider) srAnnounce(steps[n].text);
    if (s.haptics) haptics.pulse([30], 0);
  };

  const togglePlay = () => {
    if (playing) stopSpeech();
    else playFrom(step >= steps.length - 1 ? 0 : step, steps);
  };

  const retake = () => {
    stopSpeech();
    setPhase('ready');
    setSteps([]);
    setPreds([]);
    setStep(0);
  };

  // Earbud buttons and keyboard shortcuts (wired up in App) act through this.
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      primary: phase === 'ready' ? capture : phase === 'walkthrough' ? togglePlay : () => {},
      togglePlay: phase === 'walkthrough' ? togglePlay : () => {},
      next: () => go(step + 1),
      prev: () => go(step - 1),
    };
  });
  useEffect(() => () => controlsRef && (controlsRef.current = null), [controlsRef]);

  // Swipe left/right = next/previous, tap = play/pause.
  const onPointerDown = (e) => {
    pointerRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(step + (dx < 0 ? 1 : -1));
    else if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) togglePlay();
  };

  const btn =
    'grid h-16 place-items-center rounded-2xl bg-white/15 font-semibold backdrop-blur active:bg-white/25 disabled:opacity-40 focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none';

  if (phase === 'ready') {
    return (
      <>
        <button
          type="button"
          onClick={capture}
          disabled={!model}
          className="absolute inset-0 h-full w-full cursor-pointer focus:outline-none"
          aria-label="Take photo for an audio walkthrough"
          tabIndex={-1}
        />
        <footer className="pb-safe pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pt-16">
          {error && (
            <p role="alert" className="rounded-2xl bg-red-500/90 px-4 py-3 text-base font-medium">
              {error}
            </p>
          )}
          <p className="text-center text-xl leading-snug font-semibold text-balance drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {model ? 'Aim at the scene, then tap anywhere to capture.' : 'Loading Vision Model…'}
          </p>
          <button
            type="button"
            onClick={capture}
            disabled={!model}
            className="pointer-events-auto h-16 w-full rounded-2xl bg-accent text-lg font-bold text-accent-ink active:brightness-90 disabled:opacity-40 focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none"
          >
            Capture
          </button>
        </footer>
      </>
    );
  }

  const current = steps[step];
  return (
    <>
      <canvas
        ref={viewRef}
        className="absolute inset-0 h-full w-full touch-none bg-black"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (pointerRef.current = null)}
        role="img"
        aria-label="Captured photo with the described objects highlighted"
      />
      <footer className="pb-safe pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pt-16">
        {phase === 'analyzing' ? (
          <p role="status" className="text-center text-xl font-semibold">
            Analysing photo…
          </p>
        ) : (
          <>
            {steps.length > 1 && (
              <label className="pointer-events-auto block">
                <span className="block text-center text-sm font-medium text-white/70 tabular-nums">
                  Step {step + 1} of {steps.length}
                </span>
                {/* Native range: screen readers adjust it with their standard swipe up/down gesture. */}
                <input
                  type="range"
                  min={1}
                  max={steps.length}
                  step={1}
                  value={step + 1}
                  aria-label="Walkthrough step"
                  aria-valuetext={`Step ${step + 1} of ${steps.length}: ${current?.text ?? ''}`}
                  onChange={(e) => go(Number(e.target.value) - 1, { fromSlider: true })}
                  className="mt-1 w-full accent-[var(--color-accent)]"
                />
              </label>
            )}
            <p
              className="min-h-[3.5rem] text-center text-xl leading-snug font-semibold text-balance drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
            >
              {current?.text}
            </p>
            <div className="pointer-events-auto grid grid-cols-[1fr_1.4fr_1fr] gap-3">
              <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className={btn}>
                Previous
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-bold text-accent-ink active:brightness-90 focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none"
              >
                {playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={() => go(step + 1)}
                disabled={step >= steps.length - 1}
                className={btn}
              >
                Next
              </button>
            </div>
            <div className="pointer-events-auto grid grid-cols-2 gap-3">
              <button type="button" onClick={() => playFrom(0, steps)} className={`${btn} h-12`}>
                Replay
              </button>
              <button type="button" onClick={retake} className={`${btn} h-12`}>
                New photo
              </button>
            </div>
          </>
        )}
      </footer>
    </>
  );
}
