import { useState } from 'react';
import { ALL_TARGETS, COMMON_TARGETS } from '../lib/finder.js';
import { spoken } from '../lib/walkthrough.js';
import Sheet from './Sheet.jsx';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Picks the one kind of object Finder mode should look for. */
export default function FinderSheet({ current, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (list) => list.filter((t) => !q || t.includes(q) || spoken(t).includes(q));
  const common = matches(COMMON_TARGETS);
  const others = matches([...ALL_TARGETS].filter((t) => !COMMON_TARGETS.includes(t)).sort());

  const item = (t) => (
    <li key={t}>
      <button
        type="button"
        onClick={() => onPick(t)}
        aria-current={t === current ? 'true' : undefined}
        className={`min-h-12 w-full rounded-xl px-4 text-left text-lg font-semibold focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none ${
          t === current ? 'bg-accent text-accent-ink' : 'bg-white/10 active:bg-white/20'
        }`}
      >
        {cap(spoken(t))}
      </button>
    </li>
  );

  return (
    <Sheet title="What should I find?" onClose={onClose}>
      <label className="mt-3 block">
        <span className="text-sm text-white/70">Search objects</span>
        <input
          id="finder-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          className="mt-1 min-h-12 w-full rounded-xl bg-white/10 px-4 text-lg text-white placeholder-white/40 focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none"
          placeholder="cup, chair, phone…"
        />
      </label>
      {common.length > 0 && (
        <section aria-labelledby="finder-common" className="mt-4">
          <h3 id="finder-common" className="mb-2 font-bold text-accent">
            Common
          </h3>
          <ul className="grid grid-cols-2 gap-2">{common.map(item)}</ul>
        </section>
      )}
      {others.length > 0 && (
        <section aria-labelledby="finder-all" className="mt-4 pb-4">
          <h3 id="finder-all" className="mb-2 font-bold text-accent">
            All objects
          </h3>
          <ul className="grid grid-cols-2 gap-2">{others.map(item)}</ul>
        </section>
      )}
      {!common.length && !others.length && (
        <p className="py-6 text-center text-white/70">ProprioSys can&rsquo;t recognise &ldquo;{query}&rdquo; yet.</p>
      )}
    </Sheet>
  );
}
