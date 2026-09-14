import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// PWA (vite-plugin-pwa) dolazi u fazi 4 — dodaje se tek kad postoje ikone i
// manifest koje opisuje. SPEC §9.2.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
    // three.js je zaseban chunk: mijenja se rijetko, a veći je od svega ostalog.
    // Funkcijski oblik, ne objektni — Vite 8 gradi rolldownom. SPEC §9.2.
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
  },
});
