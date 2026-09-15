import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,bin,woff2,png}'],
        /*
         * Precache nosi samo ono bez cega se prvo otvaranje ne moze dogoditi.
         *
         * HR podaci se ne preuzimaju dok se mod ne odabere — to je kriterij faze 2,
         * a service worker bi ih inace povukao u pozadini pri prvom posjetu. Ostaju
         * na `runtimeCaching` pravilu ispod: dohvate se pri odabiru moda i od tada
         * su offline. OG slika je za previewe koje generiraju tudi posluzitelji,
         * pa na uredaju nikome ne treba.
         */
        globIgnores: ['**/data/hr-*.json', 'og.png'],
        // Bez ovoga bi se dnevni podaci dohvaćali ponovno pri svakom otvaranju.
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.(json|bin)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'orbis-data', expiration: { maxAgeSeconds: 2_592_000 } },
          },
        ],
        // Deep linkovi lige su klijentske rute; offline ih vraća na ljusku.
        navigateFallback: 'index.html',
        // API lige nikad ne ide iz cachea — ljestvica mora biti svježa.
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Orbis',
        short_name: 'Orbis',
        description: 'Dnevna geografska igra',
        lang: 'hr',
        theme_color: '#080B14',
        background_color: '#080B14',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
    /*
     * Font nikad ne ide u CSS kao data URI. Dva manja reza (latin-ext, display)
     * padaju ispod praga od 4 KB, pa bi ih Vite ubacio u `index.css` — a to su
     * bajtovi fonta naplaćeni CSS budžetu iz §9.5, bez `immutable` keširanja
     * koje `public/_headers` daje pravim `.woff2` datotekama.
     */
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    // three.js je zaseban chunk: mijenja se rijetko, a veći je od svega ostalog.
    // Funkcijski oblik, ne objektni — Vite 8 gradi rolldownom. SPEC §9.2.
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
  },
});
