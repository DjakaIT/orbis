import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// PWA (vite-plugin-pwa) i manualChunks za three.js dolaze u fazama 4 odnosno 1 —
// dodaju se tek kad postoje ovisnosti koje opisuju. SPEC §9.2.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
  },
});
