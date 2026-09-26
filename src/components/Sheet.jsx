import { useEffect, useId, useRef } from 'react';

/**
 * Bottom sheet built on the native <dialog>: showModal() gives a real focus
 * trap, makes the page behind inert for screen readers, and closes on Escape
 * or the Android back gesture — all standard behaviour users already know.
 */
export default function Sheet({ title, onClose, children }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => dialog.open && dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click whose target is the <dialog> itself landed on the backdrop.
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-full overflow-y-auto rounded-t-3xl border-0 bg-neutral-900 p-0 text-white backdrop:bg-black/60"
    >
      <div className="pb-safe mx-auto max-w-md px-5 pt-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-2xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="min-h-12 rounded-full bg-white/10 px-5 font-semibold focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none"
          >
            Done
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
