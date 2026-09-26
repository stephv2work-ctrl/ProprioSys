const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

// COCO labels are English, so always prefer an English voice (the user's
// regional English if available), and an on-device one for low latency.
let voice = null;
function pickVoice() {
  const voices = synth.getVoices();
  const pref = (navigator.language || 'en-US').toLowerCase();
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  voice =
    en.find((v) => v.lang.toLowerCase() === pref && v.localService) ||
    en.find((v) => v.lang.toLowerCase() === pref) ||
    en.find((v) => v.localService) ||
    en[0] ||
    null;
}
if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

let startedAt = 0;
const STUCK_MS = 7000; // Safari occasionally leaves `speaking` stuck true

function utterance(text, rate) {
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'en-US';
  u.rate = rate;
  return u;
}

export const speaker = {
  supported: Boolean(synth),

  /** iOS only allows speech after a user gesture — call from the Start tap. */
  unlock() {
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  },

  /** Returns true if the utterance was queued; non-urgent speech never interrupts. */
  say(text, { urgent = false, rate = 1 } = {}) {
    if (!synth) return false;
    const busy = synth.speaking || synth.pending;
    if (busy) {
      const stuck = performance.now() - startedAt > STUCK_MS;
      if (!urgent && !stuck) return false;
      synth.cancel();
    }
    startedAt = performance.now();
    synth.speak(utterance(text, rate));
    return true;
  },

  /**
   * Speaks `texts` one after another from `startAt`, calling `onStep(i)` as each
   * begins and `onEnd()` after the last. Returns `{ stop }`; a stopped sequence
   * never calls back again.
   */
  sequence(texts, { rate = 1, startAt = 0, gapMs = 300, onStep, onEnd } = {}) {
    let stopped = false;
    let timer = 0;
    if (!synth) {
      onEnd?.();
      return { stop() {} };
    }
    synth.cancel();
    const keep = []; // Chrome drops `onend` if the utterance is garbage-collected mid-speech

    const speakAt = (i) => {
      if (stopped) return;
      if (i >= texts.length) {
        onEnd?.();
        return;
      }
      const u = utterance(texts[i], rate);
      keep.push(u);
      let done = false;
      const advance = () => {
        if (done || stopped) return;
        done = true;
        clearTimeout(timer);
        timer = setTimeout(() => speakAt(i + 1), gapMs);
      };
      u.onend = u.onerror = advance;
      // Watchdog: some Chrome builds occasionally never fire `onend`.
      timer = setTimeout(advance, 3000 + (texts[i].length * 90) / rate);
      onStep?.(i);
      startedAt = performance.now();
      synth.speak(u);
    };
    // Chrome can swallow a speak() issued in the same tick as cancel().
    timer = setTimeout(() => speakAt(startAt), 60);

    return {
      stop() {
        stopped = true;
        clearTimeout(timer);
        synth.cancel();
      },
    };
  },

  cancel() {
    synth?.cancel();
  },
};
