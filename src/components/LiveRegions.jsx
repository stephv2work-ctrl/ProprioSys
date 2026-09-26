import { registerRegion } from '../lib/screenReader.js';

/** Invisible regions that screen readers watch; see lib/screenReader.js. */
export default function LiveRegions() {
  return (
    <>
      <div ref={(el) => registerRegion('polite', el)} className="sr-only" aria-live="polite" aria-atomic="true" />
      <div ref={(el) => registerRegion('assertive', el)} className="sr-only" aria-live="assertive" aria-atomic="true" />
    </>
  );
}
