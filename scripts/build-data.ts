/**
 * Data pipeline. SPEC §4. Izlaz ide u `public/data/` i nije u gitu.
 *
 *   pnpm data
 *
 * Proizvodi:
 *   world-topo.json    pojednostavljene granice, topojson
 *   world-meta.json    imena, kodovi, centroidi (samo za smjer strelice), bazeni meta
 *   capitals.json      glavni gradovi: naziv, drzava, koordinate, bazeni meta
 *   hr-places.json     sva hrvatska naselja i dvije razine meta
 *   ../flags/*.svg     zastave drzava, po alpha-2 kodu
 *   world-matrix.bin   Uint16Array, minimalna udaljenost granica u km
 *   aliases.json       rucni i izvedeni dodaci za pretragu
 *
 * Mreža se ovdje koristi samo za Natural Earth (prikovano izdanje) i zastave.
 * Wikidata se čita iz snimke u `scripts/sources/`, koju osvježava `pnpm sources`.
 *
 * U `dist/` datoteke dobivaju sadržajni hash u imenu (vidi `vite.config.ts`);
 * ovdje ostaju pod stalnim imenima, jer ih po njima čitaju font i testovi.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { buildFlags } from './build-flags';
import { buildFont } from './build-font';
import { buildIcons } from './build-icons';
import { buildCapitals, writeMissingCapitalsReport } from './build-capitals';
import { buildHr, writeMissingPopReport } from './build-hr';
import { buildWorld, readWikidataCountries, triIndex } from './build-world';
import { NATURAL_EARTH, NE_MAP_UNITS, fetchSource } from './fetch-sources';
import { readLegacy } from './pools';
import { normalize } from '../src/engine/search';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'data');

async function main(): Promise<void> {
  console.warn('Izvori →');
  const countriesFile = await fetchSource(NATURAL_EARTH);
  const unitsFile = await fetchSource(NE_MAP_UNITS);
  if (!countriesFile || !unitsFile) throw new Error('Natural Earth nije dostupan');

  console.warn('Svijet →');
  const started = Date.now();
  const world = await buildWorld(NATURAL_EARTH.file, NE_MAP_UNITS.file);
  const n = world.countries.length;
  console.warn(`  ${String(n)} drzava, ${String(world.missing.length)} bez hrvatskog naziva`);
  console.warn(`  matrica ${String(((Date.now() - started) / 1000).toFixed(1))} s`);

  // Stari podaci mogu ostaviti datoteke koje više ne nastaju.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'world-topo.json'), world.topo);
  await writeFile(
    join(OUT, 'world-meta.json'),
    JSON.stringify({
      n,
      countries: world.countries.map(({ qid: _qid, ...c }) => c),
      pools: world.pools,
      legacy: world.legacy,
    }),
  );
  await writeFile(join(OUT, 'world-matrix.bin'), Buffer.from(world.triangle.buffer));

  await writeMissingReport(world.missing);
  report(n, world.triangle, world.countries);

  console.warn('Zastave →');
  const flags = await buildFlags(
    world.countries.map((c) => c.a2),
    join(HERE, '..', 'public', 'flags'),
  );
  console.warn(`  ${String(flags.written)} zastava · ${String(Math.round(flags.bytes / 1024))} KB`);
  if (flags.missing.length > 0) console.warn(`  bez zastave: ${flags.missing.join(', ')}`);

  console.warn('Glavni gradovi →');
  const capitals = buildCapitals(world.countries, readWikidataCountries(), readLegacy().capitals);
  console.warn(
    `  ${String(capitals.capitals.length)} gradova, ${String(capitals.pools[1]?.ids.length ?? 0)} drzava`,
  );
  console.warn(`  bez hrvatskog naziva: ${String(capitals.withoutCroatianName.length)}`);
  console.warn(`  vise glavnih gradova: ${capitals.multiple.map((m) => m.country).join(', ')}`);
  await writeFile(
    join(OUT, 'capitals.json'),
    JSON.stringify({
      n: capitals.capitals.length,
      capitals: capitals.capitals,
      pools: capitals.pools,
      legacy: capitals.legacy,
      aliases: capitals.aliases,
    }),
  );
  await writeMissingCapitalsReport(HERE, capitals);

  console.warn('Hrvatska →');
  const croatia = await buildHr();
  console.warn(
    `  ${String(croatia.places.length)} naselja, ${String(croatia.qualified)} s općinom uz ime`,
  );
  for (const [tier, data] of Object.entries(croatia.file.tiers)) {
    console.warn(`  ${tier}: ${String(data.pools[1]?.ids.length ?? 0)} meta`);
  }
  console.warn(`  bez broja stanovnika (nisu mete): ${String(croatia.withoutPopulation.length)}`);
  await writeFile(join(OUT, 'hr-places.json'), JSON.stringify(croatia.file));
  await writeFile(
    join(OUT, 'hr-outline.json'),
    JSON.stringify({ outline: croatia.outline, counties: croatia.counties }),
  );
  await writeMissingPopReport(HERE, croatia.withoutPopulation);
  await writeFile(
    join(HERE, 'HR_TARGETS.md'),
    [
      '# Mete u modu Hrvatska, po županiji',
      '',
      'Generira `pnpm data`. Iz svake županije ulazi jednako mnogo najvećih naselja',
      '(popis 2021): 4 u razinu Gradovi, 30 u razinu Mjesta.',
      '',
      ...Object.entries(croatia.perCounty).flatMap(([county, t]) => [
        `## ${county}`,
        '',
        `Gradovi: ${t.gradovi.join(', ')}`,
        '',
        `Mjesta: ${t.mjesta.join(', ')}`,
        '',
      ]),
    ].join('\n'),
  );

  console.warn('Aliasi →');
  const aliases = mergeAliases(
    world.aliases,
    world.countries.map((c) => c.name),
    croatia.file.names,
  );
  await writeFile(join(OUT, 'aliases.json'), JSON.stringify(aliases));

  console.warn('Prijelaz →');
  for (const line of [...world.continuity, ...capitals.continuity, ...croatia.continuity]) {
    console.warn(`  ${line}`);
  }

  // Font se podskupljuje na kraju: abecedu cita iz upravo zapisanih podataka.
  console.warn('Font →');
  await buildFont();

  console.warn('Ikone →');
  await buildIcons();
}

interface Aliases {
  world: Record<string, string>;
  hr: Record<string, string>;
}

/**
 * Ručni aliasi iz `scripts/aliases.json` plus izvedeni (stari CLDR oblici,
 * varijante). Ručni imaju prednost. Alias koji pokazuje na ime kojeg nema je
 * greška u ručnoj datoteci — prije bi tiho nestao, sada ruši pipeline.
 */
function mergeAliases(
  derived: Record<string, string>,
  countryNames: string[],
  placeNames: string[],
): Aliases {
  const manual = require(join(HERE, 'aliases.json')) as Aliases;
  const world = { ...derived, ...manual.world };
  const names = new Set(countryNames.map(normalize));
  for (const [alias, target] of Object.entries(world)) {
    if (!names.has(normalize(target)))
      throw new Error(`Alias „${alias}" pokazuje na „${target}", kojeg nema`);
  }
  // Izvedeni alias koji je ujedno ime druge države bio bi dvosmislen.
  for (const alias of Object.keys(derived)) {
    if (names.has(normalize(alias)) && !(alias in manual.world)) delete world[alias];
  }

  const places = new Set(placeNames.map(normalize));
  for (const [alias, target] of Object.entries(manual.hr)) {
    if (!places.has(normalize(target)))
      throw new Error(`Alias „${alias}" pokazuje na „${target}", kojeg nema`);
  }
  return { world, hr: manual.hr };
}

async function writeMissingReport(missing: { iso: string; name: string }[]): Promise<void> {
  const lines = [
    '# Drzave bez hrvatskog naziva',
    '',
    'Ni CLDR (`cldr-localenames-full`, locale `hr`) ni Wikidata nemaju hrvatski naziv',
    'za ove zapise, pa se prikazuje izvorni naziv iz Natural Eartha. Nazivi se',
    '**ne pogadaju** — SPEC §4.2.',
    '',
    ...(missing.length > 0
      ? [
          '| Kod | Prikazuje se kao |',
          '| --- | --- |',
          ...missing.map((m) => `| ${m.iso} | ${m.name} |`),
        ]
      : ['Nijedna — sve drzave imaju hrvatski naziv iz izvora.']),
    '',
  ];
  await writeFile(join(HERE, 'MISSING_HR.md'), lines.join('\n'));
}

/**
 * Nekoliko parova cija je udaljenost poznata unaprijed. Susjedi moraju ispasti
 * 0 km — upravo to centroidi promase, zbog cega matrica i postoji. SPEC §4.3.
 */
function report(n: number, triangle: Uint16Array, entries: { iso: string }[]): void {
  const index = new Map(entries.map((e, i) => [e.iso, i]));
  const pairs: [string, string][] = [
    ['FIN', 'RUS'],
    ['HRV', 'SVN'],
    ['ENG', 'SCT'],
    ['DJI', 'SOM'],
    ['AUS', 'HRV'],
    ['NZL', 'PRT'],
  ];
  console.warn('Provjera →');
  for (const [a, b] of pairs) {
    const ia = index.get(a);
    const ib = index.get(b);
    if (ia === undefined || ib === undefined) continue;
    const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
    console.warn(`  ${a}–${b}: ${String(triangle[triIndex(lo, hi, n)])} km`);
  }
  console.warn(`  trokut ${String(Math.round(triangle.byteLength / 1024))} KB sirovo`);
}

await main();
console.warn('Gotovo.');
