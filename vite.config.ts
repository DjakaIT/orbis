import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Apsolutna adresa slike za preview, ili root-relativna kad domena nije poznata.
 *
 * Open Graph traži apsolutni URL; X ga zahtijeva, Facebook i Slack relativni
 * najčešće razriješe, ali to nigdje nije zajamčeno. Domena se ne upisuje rukom
 * nego čita iz okoline builda: Netlify postavlja `URL` za produkciju i
 * `DEPLOY_PRIME_URL` za deploy preview, pa svaki preview pokazuje na sebe.
 */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = env.URL ?? env.DEPLOY_PRIME_URL ?? env.VITE_SITE_URL;
  return base ? base.replace(/\/+$/, '') : null;
}

export function shareImageUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = siteUrl(env);
  return base ? `${base}/og.png` : '/og.png';
}

/**
 * Upisuje apsolutnu adresu u `og:image` i `twitter:image` te dodaje `og:url` i
 * kanonski link. `og:url` je uz title, type i image jedno od četiri polja koja
 * Open Graph traži, i scraperima je oslonac za razrješavanje relativnih adresa.
 */
function shareTags(): Plugin {
  return {
    name: 'orbis-share-tags',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const base = siteUrl();
        if (!base) return html;

        return {
          html: html.replaceAll('content="/og.png"', `content="${base}/og.png"`),
          tags: [
            { tag: 'meta', attrs: { property: 'og:url', content: `${base}/` }, injectTo: 'head' },
            { tag: 'link', attrs: { rel: 'canonical', href: `${base}/` }, injectTo: 'head' },
          ],
        };
      },
    },
  };
}

/**
 * Preload za tri reza fonta.
 *
 * Bez ovoga ih preglednik otkrije tek kad isparsira `index.css`, pa tekst prvo
 * padne na system-ui i tek onda skoči u pravi rez — a taj skok je ovdje bio LCP.
 * Imena su hashirana pa se ne mogu upisati u `index.html`; vade se iz bundlea.
 *
 * Sva tri se koriste na prvom ekranu: wordmark je naslovni rez, „Upiši državu"
 * je latin, a č/ć/ž/š/đ žive u latin-extu.
 */
function preloadFonts(): Plugin {
  return {
    name: 'orbis-preload-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return Object.keys(ctx.bundle ?? {})
          .filter((file) => file.endsWith('.woff2'))
          .sort()
          .map((file) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              href: `/${file}`,
              crossorigin: '',
            },
            // 'head', ne 'head-prepend': charset mora ostati prvi meta tag.
            // Preload scanner ionako cita cijeli head prije nego sto parsira CSS.
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

/**
 * Podaci dobivaju sadržajni hash u imenu, ali tek u `dist/`.
 *
 * `public/_headers` daje `/data/*` zaglavlje `immutable` na godinu dana, a
 * service worker ih drži `CacheFirst`. Pod stalnim imenom promjena podataka
 * zato ne bi stigla do igrača koji je mod već otvorio — dobio bi novi kod sa
 * starim popisom, a novi popis znači druge indekse i drugu metu. S hashom je
 * nova datoteka nova adresa.
 *
 * U `public/data` imena ostaju stalna, jer ih po njima čitaju font i testovi.
 * Vite kopira `public/` prije `writeBundle`, a PWA plugin piše service worker
 * u `closeBundle`, pa preimenovanje ovdje ulazi u precache pod novim imenom.
 */
export function dataFiles(dir = 'public/data'): Record<string, string> {
  if (!existsSync(dir)) return {};
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const hash = createHash('sha256')
      .update(readFileSync(join(dir, name)))
      .digest('hex')
      .slice(0, 10);
    const dot = name.lastIndexOf('.');
    out[name] = `${name.slice(0, dot)}.${hash}${name.slice(dot)}`;
  }
  return out;
}

function hashedData(): Plugin {
  let files: Record<string, string> = {};
  return {
    name: 'orbis-hashed-data',
    config(_, env) {
      files = env.command === 'build' ? dataFiles() : {};
      return { define: { __DATA_FILES__: JSON.stringify(files) } };
    },
    writeBundle(options) {
      const out = join(options.dir ?? 'dist', 'data');
      for (const [name, hashed] of Object.entries(files)) {
        if (existsSync(join(out, name))) renameSync(join(out, name), join(out, hashed));
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    hashedData(),
    shareTags(),
    preloadFonts(),
    /*
     * `pnpm analyze` gradi isti build i uz njega piše treemap u
     * `dist/stats.html`, s gzip veličinom po modulu. SPEC §9.5: kad PR probije
     * budžet, ovdje se vidi zašto. U običnom buildu plugina nema.
     */
    mode === 'analyze'
      ? visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: false })
      : null,
    VitePWA({
      registerType: 'autoUpdate',
      // Bez 'defer' se skripta za registraciju ubacuje u head kao blokirajuca,
      // i sama kosta 330 ms do prvog iscrtavanja. Registracija nikamo ne zuri.
      injectRegister: 'script-defer',
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        /*
         * Oboje eksplicitno. Uz `injectRegister: 'script-defer'` vite-plugin-pwa
         * prestaje ih izvoditi iz `registerType: 'autoUpdate'` i generira service
         * worker bez `clientsClaim` — a bez njega prvi posjet nikad nije pod
         * kontrolom SW-a, pa offline proradi tek iz drugog otvaranja.
         */
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,json,bin,woff2,png}'],
        // Zastave i podaci modova idu kroz runtime cache, vidi `runtimeCaching`.
        /*
         * Precache nosi samo ono bez cega se prvo otvaranje ne moze dogoditi.
         *
         * Podaci modova koji se biraju — Hrvatska i glavni gradovi — ne preuzimaju
         * se dok se mod ne odabere; to je kriterij faze 2, a service worker bi ih
         * inace povukao u pozadini pri prvom posjetu. Ostaju na `runtimeCaching`
         * pravilu ispod: dohvate se pri odabiru moda i od tada su offline. OG slika
         * je za previewe koje generiraju tudi posluzitelji, pa na uredaju ne treba.
         */
        globIgnores: [
          '**/data/hr-*.json',
          '**/data/capitals.*json',
          // 197 zastava je 1,3 MB; u partiji ih se pokaze tek nekoliko.
          'flags/**',
          'og.png',
          'stats.html',
        ],
        // Bez ovoga bi se dnevni podaci dohvaćali ponovno pri svakom otvaranju.
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.(json|bin)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'orbis-data',
              // Svaka verzija podataka je nova adresa; stare ne trebaju čekati 30 dana.
              expiration: { maxAgeSeconds: 2_592_000, maxEntries: 12 },
            },
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
        theme_color: '#F7F4ED',
        background_color: '#F7F4ED',
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
}));
