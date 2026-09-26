import { useEffect } from 'react';

const FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/**
 * Global shortcuts for Bluetooth keyboards and switch-access devices:
 * Space/Enter primary action, ←/→ previous/next, P pause, M mode, V voice on/off, S settings, H or ? help.
 */
export function useKeyboardShortcuts({ enabled, actionsRef }) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target.tagName;
      const inField = FIELDS.has(tag) || e.target.isContentEditable;
      const onButton = tag === 'BUTTON';
      const a = actionsRef.current;

      switch (e.key) {
        case ' ':
        case 'Enter':
          // A focused button already activates natively on Space/Enter.
          if (inField || onButton) return;
          a.primary();
          break;
        case 'ArrowRight':
          if (inField) return;
          a.next();
          break;
        case 'ArrowLeft':
          if (inField) return;
          a.prev();
          break;
        default: {
          if (inField) return;
          const k = e.key.toLowerCase();
          if (k === 'p') a.pause();
          else if (k === 'm') a.toggleMode();
          else if (k === 'v') a.toggleVoice();
          else if (k === 's') a.settings();
          else if (k === 'h' || k === '?') a.help();
          else return;
        }
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, actionsRef]);
}
