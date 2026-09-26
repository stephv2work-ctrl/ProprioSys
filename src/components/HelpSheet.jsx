import { useEffect, useRef, useState } from 'react';
import { HELP_SECTIONS, HELP_SPOKEN } from '../lib/guide.js';
import { speaker } from '../lib/speech.js';
import Sheet from './Sheet.jsx';

export default function HelpSheet({ settings, onClose }) {
  const seqRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => seqRef.current?.stop(), []);

  const toggleGuide = () => {
    if (playing) {
      seqRef.current?.stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    seqRef.current = speaker.sequence(HELP_SPOKEN, { rate: settings.rate, onEnd: () => setPlaying(false) });
  };

  return (
    <Sheet title="Help" onClose={onClose}>
      {settings.speech && speaker.supported && (
        <button
          type="button"
          onClick={toggleGuide}
          className="mt-4 min-h-14 w-full rounded-2xl bg-accent text-lg font-bold text-accent-ink focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none"
        >
          {playing ? 'Stop spoken guide' : 'Play spoken guide'}
        </button>
      )}
      <div className="space-y-5 py-4">
        {HELP_SECTIONS.map((s) => (
          <section key={s.title} aria-labelledby={`help-${s.title}`}>
            <h3 id={`help-${s.title}`} className="text-lg font-bold text-accent">
              {s.title}
            </h3>
            <ul className="mt-1 list-disc space-y-1.5 pl-5 text-base text-white/85">
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
