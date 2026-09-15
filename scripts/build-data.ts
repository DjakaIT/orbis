/**
 * Data pipeline. SPEC §4. Izlaz ide u `public/data/` i nije u gitu.
 *
 *   pnpm data
 *
 * Proizvodi:
 *   world-topo.json    pojednostavljene granice, topojson
 *   world-meta.json    imena, ISO kodovi, centroidi (samo za smjer strelice)
 *   capitals.json      glavni gradovi: naziv, drzava, koordinate
 *   ../flags/*.svg     zastave drzava, po alpha-2 kodu
 *   world-matrix.bin   Uint16Array(N*N), minimalna udaljenost granica u km
 *   aliases.json       rucni dodaci za pretragu
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// mapshaper je CommonJS — nema imenovanih ESM izvoza.
import mapshaper from 'mapshaper';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';

import { buildFlags } from './build-flags';
import { buildFont } from './build-font';
import { buildIcons } from './build-icons';
import { buildCapitals, writeMissingCapitalsReport } from './build-capitals';
import { buildHr, writeMissingPopReport } from './build-hr';
import { NATURAL_EARTH, NE_PLACES, fetchSource, readCached } from './fetch-sources';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'data');

/** Granica svake drzave svodi se na ovoliko tocaka prije racuna matrice. SPEC §4.3. */
const MAX_BORDER_POINTS = 250;

/** Uint16 ide do 65535; najveca stvarna udaljenost je oko 20 000 km. */
const MAX_KM = 65535;

const R = 6371;

interface NeProps {
  ISO_A3: string;
  ISO_A3_EH: string;
  ADM0_A3: string;
  ISO_A2_EH: string;
  NAME: string;
  /** Tko je suveren. Jednak `ADMIN` znaci da drzava vlada sama sobom. */
  SOVEREIGNT: string;
  ADMIN: string;
}

/**
 * Antarktika nije drzava. Jedini je zapis koji prolazi filtar suverenosti a nema
 * ni stanovnistvo ni glavni grad, pa kao dnevna meta nema smisla.
 */
const NOT_A_COUNTRY = new Set(['ATA']);

interface Country {
  id: number;
  iso: string;
  /**
   * ISO 3166-1 alpha-2. Sluzi samo za zastavicu: par regionalnih indikatora iz
   * dva slova daje emoji zastavu, pa se nijedna slika ne prenosi. Prazno kad
   * izvor nema valjan kod — tada zastave jednostavno nema.
   */
  a2: string;
  name: string;
  lat: number;
  lon: number;
}

type Ring = [number, number][];

/* ------------------------------------------------------------------ imena */

interface CldrTerritories {
  main: Record<string, { localeDisplayNames: { territories: Record<string, string> } }>;
}

/**
 * Hrvatska imena drzava dolaze iz CLDR-a (Unicode), ne iz glave. Za drzavu koje
 * ondje nema ostaje izvorni naziv i biljezi se u MISSING_HR.md. SPEC §4.2.
 */
function croatianNames(): Record<string, string> {
  const cldr = require('cldr-localenames-full/main/hr/territories.json') as CldrTerritories;
  const territories = cldr.main.hr?.localeDisplayNames.territories;
  if (!territories) throw new Error('CLDR nema hrvatske nazive teritorija');
  return territories;
}

/* ---------------------------------------------------------------- geometrija */

const rad = (d: number): number => (d * Math.PI) / 180;

function toVec(lon: number, lat: number): [number, number, number] {
  const p = rad(lat);
  const l = rad(lon);
  const c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}

function ringsOf(geometry: GeoJSON.Geometry): Ring[] {
  if (geometry.type === 'Polygon') return geometry.coordinates as Ring[];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat() as Ring[];
  return [];
}

/**
 * Uniformno uzorkovanje po duljini luka do najvise `max` tocaka.
 *
 * Naivni racun matrice je O(n²·p²) i traje predugo; redukcija granice je,
 * uz bounding box pre-filter, obavezna. SPEC §4.3.
 */
function sampleBorder(rings: Ring[], max: number): [number, number][] {
  const points: [number, number][] = [];
  for (const ring of rings) for (const p of ring) points.push([p[0], p[1]]);
  if (points.length <= max) return points;

  // Kumulativna duljina u stupnjevima je dovoljna — trazi se ravnomjeran razmak,
  // ne mjera. Male drzave ionako prolaze granu iznad.
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    cum.push((cum[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1] ?? 0;
  if (total === 0) return points.slice(0, max);

  const out: [number, number][] = [];
  let cursor = 0;
  for (let k = 0; k < max; k++) {
    const target = (total * k) / max;
    while (cursor < cum.length - 1 && (cum[cursor + 1] ?? 0) < target) cursor++;
    const p = points[cursor];
    if (p) out.push(p);
  }
  return out;
}

interface Shape {
  /** Splosteni jedinicni vektori granicnih tocaka: x,y,z,x,y,z… */
  vec: Float64Array;
  count: number;
  /** Sredisnji vektor i kutni radijus — bounding sphere za pre-filter. */
  cx: number;
  cy: number;
  cz: number;
  radius: number;
}

function toShape(rings: Ring[]): Shape {
  const pts = sampleBorder(rings, MAX_BORDER_POINTS);
  const count = pts.length;
  const vec = new Float64Array(count * 3);

  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < count; i++) {
    const p = pts[i];
    if (!p) continue;
    const [x, y, z] = toVec(p[0], p[1]);
    vec[i * 3] = x;
    vec[i * 3 + 1] = y;
    vec[i * 3 + 2] = z;
    sx += x;
    sy += y;
    sz += z;
  }

  // Sferni centroid: zbroj jedinicnih vektora, normaliziran. Za razliku od
  // aritmetickog centroida ne puca na antimeridijanu (Rusija, Fidzi).
  const len = Math.hypot(sx, sy, sz) || 1;
  const cx = sx / len;
  const cy = sy / len;
  const cz = sz / len;

  let minDot = 1;
  for (let i = 0; i < count; i++) {
    const d = (vec[i * 3] ?? 0) * cx + (vec[i * 3 + 1] ?? 0) * cy + (vec[i * 3 + 2] ?? 0) * cz;
    if (d < minDot) minDot = d;
  }

  return { vec, count, cx, cy, cz, radius: Math.acos(Math.max(-1, Math.min(1, minDot))) };
}

function centroidLatLon(s: Shape): { lat: number; lon: number } {
  return {
    lat: (Math.asin(Math.max(-1, Math.min(1, s.cz))) * 180) / Math.PI,
    lon: (Math.atan2(s.cy, s.cx) * 180) / Math.PI,
  };
}

/**
 * Minimalna udaljenost izmedu granica dviju drzava, u kilometrima.
 *
 * Centroidi lazu za velike drzave — Rusija–Finska po centroidima ispadne preko
 * 4 000 km iako dijele granicu. Zato se trazi najblizi par granicnih tocaka.
 *
 * Racuna se preko skalarnog produkta jedinicnih vektora: najveci produkt je
 * najmanji kut. Nema trigonometrije u unutarnjoj petlji, a bounding sphere
 * odsijeca tocke koje ni u najboljem slucaju ne mogu popraviti rezultat.
 */
function minDistance(a: Shape, b: Shape): number {
  let best = -2;
  for (let i = 0; i < a.count; i++) {
    const ax = a.vec[i * 3] ?? 0;
    const ay = a.vec[i * 3 + 1] ?? 0;
    const az = a.vec[i * 3 + 2] ?? 0;

    // Najbolji moguci produkt ove tocke prema cijeloj kugli oko B.
    if (best > -2) {
      const toCentre = Math.acos(Math.max(-1, Math.min(1, ax * b.cx + ay * b.cy + az * b.cz)));
      const bound = Math.cos(Math.max(0, toCentre - b.radius));
      if (bound <= best) continue;
    }

    for (let j = 0; j < b.count; j++) {
      const d =
        ax * (b.vec[j * 3] ?? 0) + ay * (b.vec[j * 3 + 1] ?? 0) + az * (b.vec[j * 3 + 2] ?? 0);
      if (d > best) {
        best = d;
        if (best >= 1) return 0;
      }
    }
  }
  return R * Math.acos(Math.max(-1, Math.min(1, best)));
}

/* --------------------------------------------------------------------- build */

async function main(): Promise<void> {
  console.warn('Izvori →');
  const source = await fetchSource(NATURAL_EARTH);
  if (!source) throw new Error('Natural Earth nije dostupan');

  console.warn('Pojednostavljivanje →');
  /*
   * keep-shapes je obavezan: bez njega male otocne drzave nestanu. SPEC §4.2.
   *
   * 5%, ne 8%: izvor je sada 50m i nosi puno vise tocaka nego 110m. Tekstura
   * globusa je 2048 px siroka, gdje jedan piksel pokriva oko 19 km na ekvatoru —
   * gusce od toga se ionako ne vidi. Mjereno: 8% daje 33,6 KB gzipano, 5% daje
   * 27,9 KB, a razlika se na globusu ne raspoznaje.
   */
  const simplified = await mapshaper.applyCommands(
    [
      '-i input.geojson',
      '-simplify visvalingam 5% keep-shapes',
      '-filter-fields ISO_A3,ISO_A3_EH,ADM0_A3,ISO_A2_EH,NAME,SOVEREIGNT,ADMIN',
      '-o format=topojson quantization=1e4 world-topo.json',
    ].join(' '),
    { 'input.geojson': await readCached(NATURAL_EARTH.file) },
  );

  const topoRaw = simplified['world-topo.json'];
  if (!topoRaw) throw new Error('mapshaper nije vratio world-topo.json');
  const topo = JSON.parse(topoRaw.toString()) as Topology;

  const layer = Object.keys(topo.objects)[0];
  if (!layer) throw new Error('topojson nema slojeva');
  const fc = feature(topo, topo.objects[layer]!) as GeoJSON.FeatureCollection;

  console.warn('Imena →');
  const hr = croatianNames();
  const missing: { iso: string; name: string }[] = [];

  interface Entry {
    iso: string;
    a2: string;
    name: string;
    shape: Shape;
  }

  const entries: Entry[] = [];
  for (const f of fc.features) {
    const p = f.properties as unknown as NeProps;

    /*
     * SPEC §4.2 filtrira `ISO_A3 !== "-99"`, ali u Natural Earthu -99 imaju i
     * Francuska i Norveska — taj filtar izbacuje dvije velike europske drzave.
     * ISO_A3_EH ih vraca; za sporne (Sj. Cipar, Somaliland, Kosovo) pada na ADM0_A3.
     */
    const iso = p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3;
    if (!iso || iso === '-99') continue;

    /*
     * U bazen ulaze samo drzave, ne i teritoriji: Portoriko, Guam, Grenland,
     * Bermudi i jos 24 ovise o nekom drugom i nisu odgovor na „koja je drzava".
     *
     * Kriterij je `SOVEREIGNT === ADMIN` — drzava koja vlada sama sobom. NE-ovo
     * polje `TYPE` za ovo ne valja: Izrael je ondje „Disputed", a Kazahstan i
     * Kuba „Sovereignty", pa bi filtar po njemu izbacio tri prave drzave.
     */
    if (p.SOVEREIGNT !== p.ADMIN) continue;
    if (NOT_A_COUNTRY.has(iso)) continue;

    const alpha2 = p.ISO_A2_EH;
    const name = alpha2 !== '-99' ? hr[alpha2] : undefined;
    if (!name) missing.push({ iso, name: p.NAME });

    entries.push({
      iso,
      a2: alpha2 && alpha2 !== '-99' ? alpha2 : '',
      name: name ?? p.NAME,
      shape: toShape(ringsOf(f.geometry)),
    });
  }

  // Poredak mora biti stabilan: on odreduje indeks mete. Natural Earth ne jamci
  // redoslijed features, pa sortiramo po ISO kodu.
  entries.sort((a, b) => a.iso.localeCompare(b.iso));

  const n = entries.length;
  console.warn(`  ${String(n)} drzava, ${String(missing.length)} bez hrvatskog naziva`);

  console.warn('Matrica →');
  const started = Date.now();
  /*
   * Matrica je simetricna s nulama na dijagonali, pa se zapisuje samo gornji
   * trokut: 31 KB umjesto 61 KB sirovo, 29 KB umjesto 57 KB gzipano. Klijent ga
   * pri ucitavanju razvija u puni N*N niz, da cijena po pogotku ostane jedan
   * pristup nizu. SPEC §4.3.
   */
  const triangle = new Uint16Array((n * (n - 1)) / 2);
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      triangle[k++] = Math.min(
        MAX_KM,
        Math.round(minDistance(entries[i]!.shape, entries[j]!.shape)),
      );
    }
  }
  console.warn(`  ${String(((Date.now() - started) / 1000).toFixed(1))} s`);

  const countries: Country[] = entries.map((e, id) => {
    const { lat, lon } = centroidLatLon(e.shape);
    return { id, iso: e.iso, a2: e.a2, name: e.name, lat: round(lat), lon: round(lon) };
  });

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'world-topo.json'), topoRaw.toString());
  await writeFile(join(OUT, 'world-meta.json'), JSON.stringify({ n, countries }));
  await writeFile(join(OUT, 'world-matrix.bin'), Buffer.from(triangle.buffer));

  const aliases = readAliases();
  await writeFile(join(OUT, 'aliases.json'), JSON.stringify(aliases));

  await writeMissingReport(missing);
  await report(n, triangle, entries);

  console.warn('Zastave →');
  const flags = await buildFlags(
    countries.map((c) => c.a2),
    join(HERE, '..', 'public', 'flags'),
  );
  console.warn(`  ${String(flags.written)} zastava · ${String(Math.round(flags.bytes / 1024))} KB`);
  console.warn(
    `  najveca: ${flags.largest.code} ${String(Math.round(flags.largest.bytes / 1024))} KB`,
  );
  if (flags.missing.length > 0) console.warn(`  bez zastave: ${flags.missing.join(', ')}`);

  console.warn('Glavni gradovi →');
  await fetchSource(NE_PLACES);
  const capitals = buildCapitals(await readCached(NE_PLACES.file), countries);
  console.warn(`  ${String(capitals.capitals.length)} gradova`);
  console.warn(`  bez hrvatskog naziva: ${String(capitals.withoutCroatianName.length)}`);
  console.warn(`  drzava bez glavnog grada: ${String(capitals.withoutCapital.length)}`);
  await writeFile(
    join(OUT, 'capitals.json'),
    JSON.stringify({ n: capitals.capitals.length, capitals: capitals.capitals }),
  );
  await writeMissingCapitalsReport(HERE, capitals);

  console.warn('Hrvatska →');
  const croatia = await buildHr();
  for (const [tier, list] of Object.entries(croatia.places)) {
    console.warn(`  ${tier}: ${String(list.length)}`);
  }
  console.warn(`  bez populacije, izostavljeno: ${String(croatia.dropped)}`);
  await writeFile(join(OUT, 'hr-places.json'), JSON.stringify(croatia.places));
  await writeFile(
    join(OUT, 'hr-outline.json'),
    JSON.stringify({ outline: croatia.outline, counties: croatia.counties }),
  );
  await writeMissingPopReport(HERE, croatia.dropped);

  // Font se podskupljuje na kraju: abecedu cita iz upravo zapisanih podataka.
  console.warn('Font →');
  await buildFont();

  console.warn('Ikone →');
  await buildIcons();
}

function round(x: number): number {
  return Math.round(x * 10) / 10;
}

interface Aliases {
  world: Record<string, string>;
  hr: Record<string, string>;
}

function readAliases(): Aliases {
  return require(join(HERE, 'aliases.json')) as Aliases;
}

async function writeMissingReport(missing: { iso: string; name: string }[]): Promise<void> {
  if (missing.length === 0) return;
  const lines = [
    '# Drzave bez hrvatskog naziva',
    '',
    'CLDR (`cldr-localenames-full`, locale `hr`) nema naziv za ove teritorije, pa se',
    'prikazuje izvorni naziv iz Natural Eartha. Nazivi se **ne pogadaju** — SPEC §4.2.',
    '',
    'Ako za neki postoji ustaljen hrvatski egzonim, dopuni ga u `scripts/hr-names.json`',
    'i pipeline ce ga preuzeti.',
    '',
    '| ISO | Prikazuje se kao |',
    '| --- | --- |',
    ...missing.map((m) => `| ${m.iso} | ${m.name} |`),
    '',
  ];
  await writeFile(join(HERE, 'MISSING_HR.md'), lines.join('\n'));
}

/** Mjesto para (i, j), i < j, u splostenom gornjem trokutu. */
function triIndex(i: number, j: number, n: number): number {
  return (i * (2 * n - i - 1)) / 2 + (j - i - 1);
}

/**
 * Nekoliko parova cija je udaljenost poznata unaprijed. Susjedi moraju ispasti
 * 0 km — upravo to centroidi promase, zbog cega matrica i postoji. SPEC §4.3.
 */
async function report(n: number, triangle: Uint16Array, entries: { iso: string }[]): Promise<void> {
  const index = new Map(entries.map((e, i) => [e.iso, i]));
  const pairs: [string, string][] = [
    ['FIN', 'RUS'],
    ['HRV', 'SVN'],
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
  await Promise.resolve();
}

await main();
console.warn('Gotovo.');
