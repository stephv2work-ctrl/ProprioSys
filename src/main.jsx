import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { updates } from './lib/updates.js';
import App from './App.jsx';
import './index.css';

// Without onNeedReload the plugin reloads the page as soon as a new version
// activates, even mid-use. App applies the update at a safe moment instead.
registerSW({ immediate: true, onNeedReload: () => updates.markPending() });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
