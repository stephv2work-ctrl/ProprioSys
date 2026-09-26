import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// Serve the production security headers from `vite preview` too, so CSP
// problems show up locally. vercel.json stays the single source of truth.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
const securityHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map(({ key, value }) => [key, value]),
);

// `npm run dev:mobile` uses --mode https: getUserMedia requires a secure
// context, so testing on a phone over the LAN needs a (self-signed) cert.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    mode === 'https' && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ProprioSys — Object Narrator',
        short_name: 'ProprioSys',
        description:
          'Points your camera at the world and speaks what it sees, with haptic cues for nearby objects.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['accessibility', 'utilities'],
        // Long-press the home-screen icon to jump straight into a mode.
        shortcuts: [
          {
            name: 'Live mode',
            short_name: 'Live',
            description: 'Continuous object announcements',
            url: '/?mode=live',
            icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Canvas mode',
            short_name: 'Canvas',
            description: 'Take a photo and hear a walkthrough',
            url: '/?mode=canvas',
            icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The TF.js chunk is larger than Workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // COCO-SSD weights (18–67 MB) — cache on first load so the app works offline after.
            urlPattern: ({ url }) =>
              url.origin === 'https://storage.googleapis.com' &&
              url.pathname.startsWith('/tfjs-models/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tfjs-models',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 180 },
              // Only real successes: an opaque (status 0) error must never be cached for months.
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // ONNX Runtime WebAssembly for the depth model, served from our own /assets
            // (too big to precache for everyone). Depth weights are cached by Transformers.js.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'onnxruntime',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  preview: { headers: securityHeaders },
  // The depth worker lazy-loads chunks, which needs ES-module workers.
  worker: { format: 'es' },
  build: {
    target: 'es2020',
    // detector chunk is TF.js itself, lazy-loaded and precached — size is expected.
    chunkSizeWarningLimit: 1000,
  },
}));
