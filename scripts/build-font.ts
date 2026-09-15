/**
 * Podskup fonta na znakove koje igra stvarno ispisuje. SPEC §9.5.
 *
 * Puni `standard` rez Bricolage Grotesquea je 131 KB za latin plus 54 KB za
 * latin-ext, protiv budžeta od 32 KB — woff2 je već komprimiran pa gzip ne pomaže.
 *
 * SPEC §2.3 traži dvije uloge iste obitelji kroz varijabilne osi. Osi su sredstvo,
 * a ne cilj: iste dvije uloge daju dva **pinana** reza uz četvrtinu težine, jer
 * varijabilni rez nosi delta podatke za svaku os i svaki glif (mjereno: 82 KB s
 * punim osima, 63 KB sa suženima, 13 KB pinano).
 *
 * Naslovni rez ispisuje točno jedan niz — „Orbis" — pa mu treba pet glifova.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import subsetFont from 'subset-font';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'styles', 'fonts');

/** Tijelo i očitanja: `wdth` 100, `opsz` 14, `wght` 400. SPEC §2.3. */
const BODY = {
  opsz: { min: 14, max: 14, default: 14 },
  wdth: { min: 100, max: 100, default: 100 },
  wght: { min: 400, max: 400, default: 400 },
} as const;

/** Wordmark: uže i optički veće — `wdth` 85, `opsz` 48, `wght` 600. SPEC §2.3. */
const DISPLAY = {
  opsz: { min: 48, max: 48, default: 48 },
  wdth: { min: 85, max: 85, default: 85 },
  wght: { min: 600, max: 600, default: 600 },
} as const;

const WORDMARK = 'Orbis';

/** Ispisivi ASCII, U+0020 – U+007E. */
const ASCII = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('');

/**
 * Znakovi koje sučelje može ispisati.
 *
 * Imena naselja i država dolaze iz podataka, pa se njihova abeceda čita iz
 * generiranih datoteka, a ne nagađa.
 */
const UI_TEXT = [
  // Nadimci u ligi su slobodan unos, pa cijeli ispisivi ASCII ulazi u rez.
  // Znak izvan njega i dalje pada na system-ui, ali samo taj znak. Vidi DECISIONS.md.
  ASCII,
  'Orbis Svijet Hrvatska Razina Gradovi Mjesta',
  'Upiši državu Upiši naselje Pogodak Podijeli Kopirano',
  'pokušaj pokušaja po udaljenosti kronološki',
  'Ne prepoznajem Podaci Natural Earth DGU GeoNames',
  'Liga Sakrij ligu Nadimak Uđi Otvori ligu Ime lige Kod Čekaj',
  'Pridružuješ se ligi Kako da te zovemo Pozovi ekipu',
  'zatvara se u ponedjeljak utorak srijedu četvrtak petak subotu nedjelju',
  'Runda zatvorena Pobjednik bodova',
  'Tuđi današnji rezultati otključavaju se kad sam odigraš',
  'Spremi ovaj link ako promijeniš uređaj',
  'Nisi član ove lige Liga ne postoji Nešto je puklo Greška na poslužitelju',
  'Dnevna geografska igra Podaci se nisu učitali Runda je zatvorena',
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'čćđšžČĆĐŠŽ',
  '0123456789',
  ' .,:;!?()[]{}„”“"\'’–—-/·×+=%&#@*',
  // Strelice smjera, oznaka pogotka, kvačica i točkice na ljestvici.
  '↑↗→↘↓↙←↖✦✓⋯',
  // Tanki razmak je razdjelnik tisućica, nedjeljivi drži brojeve zajedno. SPEC §2.3.
  // Pisani kodnom točkom jer su u izvoru nevidljivi.
  String.fromCodePoint(0x2009, 0x00a0),
].join('');

interface Meta {
  countries: { name: string }[];
}
interface Places {
  gradovi: { name: string }[];
  mjesta: { name: string }[];
}

/**
 * Cijeli skup znakova koji ulazi u rez tijela: sučelje plus abeceda podataka,
 * bez ponavljanja i sortiran da izlaz bude stabilan između pokretanja.
 *
 * Izloženo zbog testa: ime države ili naselja koje ispadne iz ovog skupa ispisuje
 * se system-ui rezom usred hrvatske rečenice, i to se vidi.
 */
export async function subsetCharacters(): Promise<string> {
  return [...new Set(UI_TEXT + (await dataCharacters()))].sort().join('');
}

async function dataCharacters(): Promise<string> {
  const dir = join(HERE, '..', 'public', 'data');
  let out = '';
  try {
    const meta = JSON.parse(await readFile(join(dir, 'world-meta.json'), 'utf8')) as Meta;
    out += meta.countries.map((c) => c.name).join('');
  } catch {
    console.warn('  world-meta.json nije nađen — pokreni `pnpm data` prije fonta');
  }
  try {
    const places = JSON.parse(await readFile(join(dir, 'hr-places.json'), 'utf8')) as Places;
    out += [...places.gradovi, ...places.mjesta].map((p) => p.name).join('');
  } catch {
    console.warn('  hr-places.json nije nađen — pokreni `pnpm data` prije fonta');
  }
  return out;
}

function source(range: 'latin' | 'latin-ext'): Promise<Buffer> {
  return readFile(
    require.resolve(
      `@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-${range}-standard-normal.woff2`,
    ),
  );
}

export async function buildFont(): Promise<void> {
  const text = await subsetCharacters();
  await mkdir(OUT, { recursive: true });

  const [latin, latinExt] = await Promise.all([source('latin'), source('latin-ext')]);

  const cuts: [string, Buffer, string, typeof BODY | typeof DISPLAY][] = [
    ['body-latin.woff2', latin, text, BODY],
    ['body-latin-ext.woff2', latinExt, text, BODY],
    ['display.woff2', latin, WORDMARK, DISPLAY],
  ];

  let total = 0;
  for (const [name, from, chars, axes] of cuts) {
    const out = await subsetFont(from, chars, {
      targetFormat: 'woff2',
      variationAxes: axes,
    });
    await writeFile(join(OUT, name), out);
    total += out.byteLength;
    console.warn(`  ${name.padEnd(22)} ${kb(out.byteLength)}`);
  }

  console.warn(`  znakova: ${String(text.length)} · ukupno ${kb(total)} (budžet 32 KB)`);
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
