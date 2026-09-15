import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { decodePng } from './png';

/**
 * Provjera produkcijskog builda: PWA manifest, meta tagovi za dijeljenje,
 * precache service workera i budzeti iz SPEC §9.5.
 *
 * Ovo su stvari koje ne pucaju u razvoju — manifest koji pokazuje na nepostojecu
 * ikonu, OG slika krivog omjera ili font ubacen u CSS kao data URI vide se tek na
 * produkcijskoj domeni, kad je vec kasno.
 *
 * Trazi `pnpm build`. Bez `dist/` se preskace, jer `pnpm check` ne gradi.
 */

const DIST = join(import.meta.dirname, '..', '..', 'dist');
const built = existsSync(join(DIST, 'index.html'));

const read = (p: string): Buffer => readFileSync(join(DIST, p));
const text = (p: string): string => read(p).toString('utf8');
const kb = (p: string): number => gzipSync(read(p), { level: 9 }).byteLength / 1024;

/** Sve datoteke u dist/assets, po nastavku. */
function assets(ext: string): string[] {
  if (!built) return [];
  return readdirSync(join(DIST, 'assets'))
    .filter((f) => f.endsWith(ext))
    .map((f) => `assets/${f}`);
}

function sum(paths: string[]): number {
  return paths.reduce((total, p) => total + kb(p), 0);
}

/** URL-ovi koje service worker precachea. */
function precached(): string[] {
  return [...text('sw.js').matchAll(/\{url:"([^"]+)"/g)].map((m) => m[1] ?? '');
}

describe.skipIf(!built)('PWA manifest', () => {
  const manifest = JSON.parse(text('manifest.webmanifest')) as {
    name: string;
    short_name: string;
    lang: string;
    display: string;
    start_url: string;
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };

  it('index.html ga poziva i registrira service worker', () => {
    const html = text('index.html');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('registerSW.js');
    expect(existsSync(join(DIST, 'sw.js'))).toBe(true);
  });

  it('ima polja bez kojih se aplikacija ne instalira', () => {
    expect(manifest.name).toBe('Orbis');
    expect(manifest.short_name).toBe('Orbis');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.lang).toBe('hr');
  });

  it('boje se slazu s --void iz tokens.css', () => {
    /*
     * Razlicit theme_color i pozadina stranice daju bljesak pri pokretanju.
     * Vrijednost se cita iz tokena, ne upisuje ovdje — inace bi svaka promjena
     * palete trazila da netko sjeti promijeniti i ovaj test.
     */
    const tokens = readFileSync(
      join(import.meta.dirname, '..', '..', 'src', 'styles', 'tokens.css'),
      'utf8',
    );
    const background = /--void:\s*(#[0-9a-fA-F]{6});/.exec(tokens)?.[1]?.toLowerCase();
    expect(background, 'tokens.css nema --void').toBeTruthy();

    expect(manifest.theme_color.toLowerCase()).toBe(background);
    expect(manifest.background_color.toLowerCase()).toBe(background);
    expect(text('index.html').toLowerCase()).toContain(`content="${background ?? ''}"`);
  });

  it('svaka ikona postoji i ima tocno onu velicinu koju tvrdi', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    for (const ikona of manifest.icons) {
      const path = ikona.src.replace(/^\//, '');
      expect(existsSync(join(DIST, path)), `nema ${ikona.src}`).toBe(true);

      const png = decodePng(read(path));
      const [w, h] = ikona.sizes.split('x').map(Number);
      expect([png.width, png.height], ikona.src).toEqual([w, h]);
      expect(ikona.type).toBe('image/png');
    }
  });

  it('ima maskable ikonu od 512 px', () => {
    // Bez nje Android sam obrezuje kvadrat i stavlja ga u bijeli krug.
    const maskable = manifest.icons.find((i) => i.purpose === 'maskable');
    expect(maskable?.sizes).toBe('512x512');
  });

  it('apple-touch-icon je povezan i postoji', () => {
    expect(text('index.html')).toContain('rel="apple-touch-icon"');
    expect(decodePng(read('apple-touch-icon.png')).width).toBe(180);
  });
});

describe.skipIf(!built)('meta tagovi za dijeljenje', () => {
  const html = text('index.html');

  /**
   * Cita `content` iz meta taga. Tag se trazi cijeli pa mu se atributi vade
   * odvojeno — prettier duge tagove lomi u vise redaka, a njihov redoslijed
   * nije zajamcen.
   */
  const meta = (attr: 'property' | 'name', key: string): string | undefined => {
    for (const [tag] of html.matchAll(/<meta\s[^>]*>/g)) {
      if (new RegExp(`${attr}="${key}"`).test(tag)) return /content="([^"]*)"/.exec(tag)?.[1];
    }
    return undefined;
  };

  it('ima naslov, opis i jezik', () => {
    expect(html).toContain('<html lang="hr">');
    expect(/<title>([^<]+)<\/title>/.exec(html)?.[1]).toMatch(/Orbis/);
    expect(meta('name', 'description')).toMatch(/geografska igra/);
  });

  it('ima OG i Twitter par, oba prema istoj slici', () => {
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:title')).toMatch(/Orbis/);
    expect(meta('property', 'og:description')).toBeTruthy();
    expect(meta('property', 'og:locale')).toBe('hr_HR');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'));
  });

  it('OG slika postoji i ima tocno dimenzije koje tagovi tvrde', () => {
    // Kriv omjer znaci obrezan preview u Slacku i iMessageu, bez ijedne greske.
    const src = meta('property', 'og:image') ?? '';
    const png = decodePng(read(src.replace(/^\//, '')));
    expect(String(png.width)).toBe(meta('property', 'og:image:width'));
    expect(String(png.height)).toBe(meta('property', 'og:image:height'));
    // 1200 x 630 je omjer koji Facebook, X, Slack i iMessage prikazuju cijeli.
    expect([png.width, png.height]).toEqual([1200, 630]);
  });
});

describe.skipIf(!built)('service worker', () => {
  const urls = precached();

  it('precachea ljusku, oba chunka i font', () => {
    expect(urls).toContain('index.html');
    expect(urls.some((u) => /^assets\/index-.*\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /^assets\/three-.*\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => u.endsWith('.woff2'))).toBe(true);
  });

  it('precachea svjetske podatke, jer bez njih nema prve partije', () => {
    expect(urls).toContain('data/world-topo.json');
    expect(urls).toContain('data/world-matrix.bin');
    expect(urls).toContain('data/world-meta.json');
  });

  it('ne precachea HR podatke', () => {
    // Kriterij faze 2: HR podaci se ne preuzimaju dok se mod ne odabere.
    // Precache bi ih povukao u pozadini pri prvom posjetu i to bi prekrsio.
    expect(urls.filter((u) => u.includes('hr-'))).toEqual([]);
  });

  it('ne precachea OG sliku', () => {
    // Nju dohvacaju tudi posluzitelji za preview, nikad uredaj igraca.
    expect(urls).not.toContain('og.png');
  });

  it('preuzima kontrolu nad vec otvorenom stranicom', () => {
    // Bez `clientsClaim` prvi posjet nikad nije pod kontrolom SW-a, pa offline
    // proradi tek iz drugog otvaranja. vite-plugin-pwa ga tiho izostavi uz neke
    // kombinacije opcija — `injectRegister: 'script-defer'` je jedna takva.
    expect(text('sw.js')).toContain('clientsClaim');
    expect(text('sw.js')).toContain('skipWaiting');
  });

  it('registracija ne blokira iscrtavanje', () => {
    // Skripta za registraciju je u headu; bez `defer` sama kosta 330 ms do FCP-a.
    expect(text('index.html')).toMatch(/registerSW\.js"\s+defer/);
  });

  it('vraca se na ljusku za deep linkove lige, ali ne za API', () => {
    const sw = text('sw.js');
    expect(sw).toContain('index.html');
    expect(sw).toMatch(/\/\^\\\/api/);
  });
});

describe.skipIf(!built)('budzeti iz SPEC §9.5', () => {
  /**
   * `budget` je brojka iz SPEC-a. `ceiling` postoji samo ondje gdje je odstupanje
   * zabiljezeno u DECISIONS.md — test tada cuva od daljnjeg rasta, a ne pretvara
   * se da je budzet postignut.
   */
  const items: { name: string; files: () => string[]; budget: number; ceiling?: number }[] = [
    // React + react-dom su ~60 KB prije ijedne linije igre. DECISIONS.md, 2026-09-14.
    {
      name: 'JS bez three.js',
      files: () => assets('.js').filter((f) => !f.includes('three-')),
      budget: 45,
      ceiling: 92,
    },
    // WebGLRenderer se ne da tree-shakeati dok se crta na WebGL-u.
    {
      name: 'three.js chunk',
      files: () => assets('.js').filter((f) => f.includes('three-')),
      budget: 85,
      ceiling: 132,
    },
    { name: 'CSS', files: () => assets('.css'), budget: 6 },
    { name: 'world-topo.json', files: () => ['data/world-topo.json'], budget: 40 },
    { name: 'world-matrix.bin', files: () => ['data/world-matrix.bin'], budget: 40 },
    { name: 'font woff2', files: () => assets('.woff2'), budget: 32 },
    {
      name: 'HR podaci (lazy)',
      files: () => [
        'data/hr-places.json',
        'data/hr-outline.json',
        ...assets('.js').filter((f) => f.includes('MapHR-') || f.includes('loadHr-')),
        ...assets('.css').filter((f) => f.includes('MapHR-')),
      ],
      budget: 60,
    },
  ];

  for (const item of items) {
    it(`${item.name} ≤ ${String(item.ceiling ?? item.budget)} KB`, () => {
      const files = item.files();
      expect(files.length, `nema datoteka za ${item.name}`).toBeGreaterThan(0);

      const size = sum(files);
      expect(size, `${size.toFixed(1)} KB, budzet ${String(item.budget)} KB`).toBeLessThanOrEqual(
        item.ceiling ?? item.budget,
      );
    });
  }

  it('prvi load u modu svijet ≤ 280 KB', () => {
    // SPEC trazi 250 KB. Razlika je tocno zbroj dva odstupanja iznad — React i
    // three.js — i nijedno se ne moze skinuti bez promjene stacka iz §1.
    const first = [
      'index.html',
      ...assets('.css').filter((f) => f.includes('index-')),
      ...assets('.js').filter((f) => !/League-|MapHR-|loadHr-/.test(f)),
      ...assets('.woff2'),
      'data/world-topo.json',
      'data/world-matrix.bin',
      'data/world-meta.json',
      'data/aliases.json',
    ];
    expect(sum(first)).toBeLessThanOrEqual(280);
  });

  it('font se preloada, ne ceka na CSS', () => {
    // Bez preloada preglednik otkrije rez tek nakon parsiranja `index.css`,
    // pa tekst skoci iz system-ui u Bricolage usred prvog iscrtavanja.
    const html = text('index.html');
    for (const font of assets('.woff2')) {
      expect(html, font).toContain(`rel="preload" as="font" type="font/woff2" href="/${font}"`);
    }
  });

  it('font nije ubacen u CSS kao data URI', () => {
    // Inlinean font trosi CSS budzet i gubi `immutable` iz public/_headers.
    for (const css of assets('.css')) {
      expect(text(css), css).not.toContain('data:font');
    }
  });

  it('_headers je zavrsio u buildu', () => {
    expect(text('_headers')).toContain('immutable');
  });
});
