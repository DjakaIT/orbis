/**
 * Svjetski bazen: granice, imena, matrica i bazeni meta. SPEC §4.2 i §4.3.
 *
 * Izvori: Natural Earth 50m (države) i 50m map units (samo četiri dijela
 * Ujedinjenog Kraljevstva), Unicode CLDR i Wikidata za hrvatska imena.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// mapshaper je CommonJS — nema imenovanih ESM izvoza.
import mapshaper from 'mapshaper';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';

import type { Pool } from '../src/engine/seed';
import { CACHE } from './fetch-sources';
import { SOURCES, type WdCountry } from './fetch-wikidata';
import { CUTOVER, assertContinuity, datedPools, readLegacy } from './pools';

const require = createRequire(import.meta.url);

/** Granica svake drzave svodi se na ovoliko tocaka prije racuna matrice. SPEC §4.3. */
const MAX_BORDER_POINTS = 250;
/** Uint16 ide do 65535; najveca stvarna udaljenost je oko 20 000 km. */
const MAX_KM = 65535;
const R = 6371;

interface NeProps {
  ISO_A3_EH: string;
  ADM0_A3: string;
  ISO_A2_EH: string;
  NAME: string;
  /** Tko je suveren. Jednak `ADMIN` znaci da drzava vlada sama sobom. */
  SOVEREIGNT: string;
  ADMIN: string;
  GU_A3?: string;
  WIKIDATAID?: string;
}

interface NeFeature {
  type: 'Feature';
  properties: NeProps;
  geometry: GeoJSON.Geometry;
}

/**
 * Antarktika nije drzava. Jedini je zapis koji prolazi filtar suverenosti a nema
 * ni stanovnistvo ni glavni grad, pa kao dnevna meta nema smisla.
 */
const NOT_A_COUNTRY = new Set(['ATA']);

/**
 * Ujedinjeno Kraljevstvo igra kao četiri mete — odluka 2026-11-12, DECISIONS.md.
 * Kodovi su Natural Earthovi (`GU_A3`), a alpha-2 za zastavu je ISO 3166-2 oznaka
 * dijela, po kojoj izvor zastava (`flag-icons`) i imenuje datoteke.
 */
const UK_PARTS: Record<string, string> = {
  ENG: 'GB-ENG',
  SCT: 'GB-SCT',
  WLS: 'GB-WLS',
  NIR: 'GB-NIR',
};

/**
 * Područja koja Natural Earth crta kao zasebne države, a nijedna ih članica UN-a
 * osim jedne ne priznaje (Somaliland nijedna, Sj. Cipar samo Turska), pa se
 * crtaju kao dio države od koje su se odcijepila. Tampon-zona UN-a na Cipru je
 * de iure Cipar. Pogodak Somalije tako oboji i sjever, bez granice preko sredine.
 */
const MERGED_INTO: Record<string, string> = { SOL: 'SOM', CYN: 'CYP', CNM: 'CYP' };

/**
 * Ostaje na karti kao kopno, ali nije ni meta ni upis — kao Grenland. Zapadna
 * Sahara je za UN nesamoupravni teritorij, a ne država.
 */
const NOT_IN_POOL = new Set(['ESH']);

/**
 * CLDR za ovu oznaku daje službeni lokalni oblik („Timor-Leste"), a hrvatski
 * egzonim drži kao svoju varijantu („Istočni Timor"). Uzima se varijanta.
 */
const PREFER_CLDR_VARIANT = new Set(['TL']);

export interface Country {
  id: number;
  iso: string;
  /**
   * ISO 3166-1 alpha-2, ili 3166-2 za dijelove UK-a. Sluzi samo za zastavicu.
   * Prazno kad izvor nema valjan kod — tada zastave jednostavno nema.
   */
  a2: string;
  name: string;
  lat: number;
  lon: number;
  /** Wikidata ID, za glavni grad. */
  qid: string;
}

type Ring = [number, number][];

/* ------------------------------------------------------------------ imena */

interface CldrTerritories {
  main: Record<string, { localeDisplayNames: { territories: Record<string, string> } }>;
}

function cldrTerritories(): Record<string, string> {
  const cldr = require('cldr-localenames-full/main/hr/territories.json') as CldrTerritories;
  const territories = cldr.main.hr?.localeDisplayNames.territories;
  if (!territories) throw new Error('CLDR nema hrvatske nazive teritorija');
  return territories;
}

export function readWikidataCountries(): Map<string, WdCountry> {
  const list = JSON.parse(
    readFileSync(join(SOURCES, 'wikidata-countries.json'), 'utf8'),
  ) as WdCountry[];
  return new Map(list.map((c) => [c.qid, c]));
}

export interface CountryName {
  name: string;
  source: 'cldr' | 'wikidata' | 'natural-earth';
  /** Drugi oblici koji se prihvaćaju kao upis: stari CLDR, varijante, Wikidata. */
  aliases: string[];
}

/**
 * Hrvatsko ime države. Ništa se ne piše iz glave — SPEC §4.2.
 *
 * 1. CLDR je prvi izvor: kuriran je, stabilan i već je bio u igri.
 * 2. CLDR za neke države daje oblik za popise s crticom ili zagradom —
 *    „Kongo - Kinshasa", „Mjanmar (Burma)" — koji nije ime nego razlikovna
 *    oznaka. Tada ide Wikidatin hrvatski naziv: Demokratska Republika Kongo.
 * 3. Dijelovi UK-a nemaju CLDR zapis (nisu ISO 3166-1), pa ide Wikidata.
 * 4. Inače izvorni naziv iz Natural Eartha, uz zapis u MISSING_HR.md.
 *
 * Svaki drugi oblik koji izvori znaju ostaje kao alias, pa stari upis i dalje
 * radi: „Kongo - Kinshasa", „Timor-Leste", „Burma", „Svazi".
 */
export function countryName(
  a2: string,
  wikidataHr: string | null,
  neName: string,
  cldr: Record<string, string>,
): CountryName {
  const base = cldr[a2];
  const variant = cldr[`${a2}-alt-variant`];
  const short = cldr[`${a2}-alt-short`];
  const others = [base, variant, short, wikidataHr].filter((x): x is string => Boolean(x));

  let name: string;
  let source: CountryName['source'];
  if (base && PREFER_CLDR_VARIANT.has(a2) && variant) {
    name = variant;
    source = 'cldr';
  } else if (base && !/ - |\(/.test(base)) {
    name = base;
    source = 'cldr';
  } else if (wikidataHr) {
    name = wikidataHr;
    source = 'wikidata';
  } else if (base) {
    name = base;
    source = 'cldr';
  } else {
    name = neName;
    source = 'natural-earth';
  }

  return { name, source, aliases: [...new Set(others)].filter((x) => x !== name) };
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
 * 4 000 km iako dijele granicu. Zato se trazi najblizi par granicnih tocaka,
 * preko skalarnog produkta jedinicnih vektora, uz bounding sphere koji odsijeca
 * tocke koje ni u najboljem slucaju ne mogu popraviti rezultat.
 */
function minDistance(a: Shape, b: Shape): number {
  let best = -2;
  for (let i = 0; i < a.count; i++) {
    const ax = a.vec[i * 3] ?? 0;
    const ay = a.vec[i * 3 + 1] ?? 0;
    const az = a.vec[i * 3 + 2] ?? 0;

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

/** Kod pod kojim feature ulazi u kartu: ISO_A3_EH, inače ADM0_A3. */
function codeOf(p: NeProps): string {
  return p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3;
}

function readFc(file: string): NeFeature[] {
  return (JSON.parse(readFileSync(join(CACHE, file), 'utf8')) as { features: NeFeature[] })
    .features;
}

export interface WorldResult {
  topo: string;
  countries: Country[];
  triangle: Uint16Array;
  pools: Pool[];
  /** Stari id → novi id. Za partije spremljene prije prijelaza. */
  legacy: number[];
  aliases: Record<string, string>;
  missing: { iso: string; name: string }[];
  continuity: string[];
}

export async function buildWorld(countriesFile: string, unitsFile: string): Promise<WorldResult> {
  const ne = readFc(countriesFile);
  const units = readFc(unitsFile).filter((f) => f.properties.GU_A3 && UK_PARTS[f.properties.GU_A3]);
  if (units.length !== 4)
    throw new Error(`Očekivana 4 dijela UK-a, nađeno ${String(units.length)}`);

  /*
   * Ulaz za kartu: sve iz sloja država osim UK-a, kojeg zamjenjuju četiri dijela.
   * Svaki feature nosi `CODE` — kod pod kojim se crta i boji. Spojena područja
   * dobiju kod države u koju ulaze, pa ih `-dissolve` stopi u jedan oblik.
   */
  const input: GeoJSON.Feature[] = [];
  for (const f of ne) {
    const code = codeOf(f.properties);
    if (code === 'GBR') continue;
    input.push({
      type: 'Feature',
      properties: { CODE: MERGED_INTO[code] ?? code },
      geometry: f.geometry,
    });
  }
  for (const f of units) {
    input.push({ type: 'Feature', properties: { CODE: f.properties.GU_A3 }, geometry: f.geometry });
  }

  /*
   * `-dissolve` prije pojednostavljivanja: granica Somalije i Somalilanda nestaje
   * prije nego što se išta stanji. keep-shapes je obavezan — bez njega male
   * otočne države nestanu. SPEC §4.2. 5% jer 50m nosi puno točaka, a tekstura
   * od 2048 px ionako ne vidi gušće (vidi DECISIONS.md, 2026-09-15).
   */
  const simplified = await mapshaper.applyCommands(
    [
      '-i input.geojson',
      '-dissolve CODE',
      '-simplify visvalingam 5% keep-shapes',
      '-o format=topojson quantization=1e4 world-topo.json',
    ].join(' '),
    { 'input.geojson': JSON.stringify({ type: 'FeatureCollection', features: input }) },
  );

  const topoRaw = simplified['world-topo.json'];
  if (!topoRaw) throw new Error('mapshaper nije vratio world-topo.json');
  const topo = JSON.parse(topoRaw.toString()) as Topology;
  const layer = Object.keys(topo.objects)[0];
  if (!layer) throw new Error('topojson nema slojeva');
  const fc = feature(topo, topo.objects[layer]!) as GeoJSON.FeatureCollection;

  const shapes = new Map<string, Shape>();
  for (const f of fc.features) {
    const code = (f.properties as { CODE?: string } | null)?.CODE;
    if (code) shapes.set(code, toShape(ringsOf(f.geometry)));
  }

  /* ----------------------------------------------------------- bazen država */

  const cldr = cldrTerritories();
  const wikidata = readWikidataCountries();
  const missing: { iso: string; name: string }[] = [];
  const aliases: Record<string, string> = {};

  interface Entry {
    iso: string;
    a2: string;
    name: string;
    qid: string;
    shape: Shape;
  }
  const entries: Entry[] = [];

  const add = (iso: string, a2: string, p: NeProps): void => {
    const shape = shapes.get(iso);
    if (!shape) throw new Error(`${iso} nema oblik nakon spajanja`);
    const qid = p.WIKIDATAID ?? '';
    // Dijelovi UK-a nose `GB-ENG` i slično, čega u CLDR-u nema, pa padaju na Wikidatu.
    const named = countryName(a2, wikidata.get(qid)?.hr ?? null, p.NAME, cldr);
    if (named.source === 'natural-earth') missing.push({ iso, name: named.name });
    for (const alias of named.aliases) aliases[alias] = named.name;
    entries.push({ iso, a2, name: named.name, qid, shape });
  };

  for (const f of ne) {
    const p = f.properties;
    const iso = codeOf(p);
    if (!iso || iso === '-99') continue;
    /*
     * U bazen ulaze samo države, ne i teritoriji (Portoriko, Guam, Grenland).
     * Kriterij je `SOVEREIGNT === ADMIN`; NE-ovo polje `TYPE` za ovo ne valja:
     * Izrael je ondje „Disputed", a Kazahstan i Kuba „Sovereignty".
     */
    if (p.SOVEREIGNT !== p.ADMIN) continue;
    if (NOT_A_COUNTRY.has(iso) || NOT_IN_POOL.has(iso) || MERGED_INTO[iso] || iso === 'GBR') {
      continue;
    }
    add(iso, p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : '', p);
  }
  for (const f of units) {
    const code = f.properties.GU_A3 ?? '';
    add(code, UK_PARTS[code] ?? '', f.properties);
  }

  // Poredak mora biti stabilan: on odreduje indeks mete. Natural Earth ne jamci
  // redoslijed features, pa sortiramo po kodu.
  entries.sort((a, b) => a.iso.localeCompare(b.iso));
  const n = entries.length;

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

  const countries: Country[] = entries.map((e, id) => {
    const { lat, lon } = centroidLatLon(e.shape);
    return { id, iso: e.iso, a2: e.a2, name: e.name, lat: round(lat), lon: round(lon), qid: e.qid };
  });

  /* ------------------------------------------------------- prijelaz s v1 */

  const legacyList = readLegacy().world;
  const byIso = new Map(countries.map((c) => [c.iso, c.id]));
  const legacyCentroid = new Map<string, { lat: number; lon: number }>();
  for (const f of ne) {
    const iso = codeOf(f.properties);
    const s = toShape(ringsOf(f.geometry));
    if (!legacyCentroid.has(iso)) legacyCentroid.set(iso, centroidLatLon(s));
  }

  /*
   * Stari kod koji više nije u popisu ide na državu s najbližim središtem:
   * Somaliland → Somalija, Sj. Cipar → Cipar, UK → Engleska, Zapadna Sahara →
   * Mauretanija. To se vidi samo u partiji koja je spremljena prije prijelaza i
   * u danima koji su već prošli; budući dani do prijelaza provjereni su ispod.
   */
  const legacy = legacyList.map((iso) => {
    const direct = byIso.get(MERGED_INTO[iso] ?? iso);
    if (direct !== undefined) return direct;
    const from = legacyCentroid.get(iso);
    if (!from) throw new Error(`Stari kod ${iso} nema oblik`);
    let best = 0;
    let bestKm = Infinity;
    for (const c of countries) {
      const d = haversine(from, c);
      if (d < bestKm) {
        bestKm = d;
        best = c.id;
      }
    }
    return best;
  });

  const pools = datedPools(
    legacy,
    countries.map((c) => c.id),
  );
  const continuity = assertContinuity(
    'svijet',
    'world',
    legacyList.length,
    pools,
    (oldId, newId) => {
      return legacyList[oldId] === countries[newId]?.iso;
    },
  );

  return {
    topo: topoRaw.toString(),
    countries,
    triangle,
    pools,
    legacy,
    aliases,
    missing,
    continuity: [`prijelaz ${CUTOVER}`, ...continuity],
  };
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function round(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Mjesto para (i, j), i < j, u splostenom gornjem trokutu. */
export function triIndex(i: number, j: number, n: number): number {
  return (i * (2 * n - i - 1)) / 2 + (j - i - 1);
}
