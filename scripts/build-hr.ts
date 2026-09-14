/**
 * Hrvatski dio pipelinea. SPEC §4.4.
 *
 * Naselja su točke pa matrica nije potrebna — haversine u runtimeu je trivijalan.
 * Treća razina (svih ~6 500 naselja) se namjerno ne gradi: s tolikim brojem igra
 * prelazi u nagađanje.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import mapshaper from 'mapshaper';

import { CACHE, GEONAMES_HR, NE_ADMIN1, fetchSource, readCached } from './fetch-sources';
import { readZipEntry } from './unzip';

/** SPEC §4.4: dvije razine težine, treća se ne gradi. */
const TIERS = { gradovi: 5000, mjesta: 800 } as const;

export type Tier = keyof typeof TIERS;

/**
 * GeoNames kodovi obilježja koji su stvarna naselja.
 *
 * Izostavljeni su namjerno: `PPLX` je dio naselja (zagrebački „Centar" ima 37 000
 * stanovnika, ali nije naselje), `PPLQ` napušteno, `PPLW` razoreno, `PPLH`
 * povijesno. Bez toga bi se u igri pojavili kvartovi i nepostojeća mjesta.
 */
const SETTLEMENT_CODES = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLC', 'PPLL']);

export interface HrPlace {
  id: number;
  code: string;
  name: string;
  lat: number;
  lon: number;
}

export interface HrData {
  places: Record<Tier, HrPlace[]>;
  outline: GeoJSON.FeatureCollection;
  counties: GeoJSON.FeatureCollection;
  dropped: number;
}

interface Row {
  code: string;
  name: string;
  lat: number;
  lon: number;
  population: number;
  featureCode: string;
}

function parseGeoNames(txt: string): Row[] {
  const out: Row[] = [];
  for (const line of txt.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c[6] !== 'P') continue;
    const featureCode = c[7] ?? '';
    if (!SETTLEMENT_CODES.has(featureCode)) continue;

    const name = c[1] ?? '';
    const lat = Number(c[4]);
    const lon = Number(c[5]);
    if (!name || Number.isNaN(lat) || Number.isNaN(lon)) continue;

    out.push({
      code: c[0] ?? '',
      name,
      lat,
      lon,
      population: Number(c[14]) || 0,
      featureCode,
    });
  }
  return out;
}

/**
 * Isto ime na više mjesta zadržava samo najmnogoljudnije.
 *
 * Igrač upisuje ime, ne koordinatu; dva „Gornja Sela" u istoj listi znače da je
 * jedno od njih nepogodivo.
 */
function dedupe(rows: Row[]): Row[] {
  const best = new Map<string, Row>();
  for (const r of rows) {
    const existing = best.get(r.name);
    if (!existing || r.population > existing.population) best.set(r.name, r);
  }
  return [...best.values()];
}

export async function buildHr(): Promise<HrData> {
  const zipPath = await fetchSource(GEONAMES_HR);
  if (!zipPath) throw new Error('GeoNames HR nije dostupan');
  const admin1 = await fetchSource(NE_ADMIN1);
  if (!admin1) throw new Error('Natural Earth admin 1 nije dostupan');

  const txt = readZipEntry(await readFile(join(CACHE, GEONAMES_HR.file)), 'HR.txt');
  const all = parseGeoNames(txt);

  /*
   * Populacija se ne procjenjuje. GeoNames je ovdje izvor, a ne dopuna DGU-a —
   * DGU URL nije stabilan i `fetch-sources.ts` ispisuje uputu za ručni dohvat.
   * Naselja bez populacije jednostavno ispadaju iz oba bazena. SPEC §4.4.
   */
  const withPopulation = all.filter((r) => r.population > 0);
  const dropped = all.length - withPopulation.length;

  const places = {} as Record<Tier, HrPlace[]>;
  for (const [tier, threshold] of Object.entries(TIERS) as [Tier, number][]) {
    const rows = dedupe(withPopulation.filter((r) => r.population > threshold))
      // Poredak određuje koja je meta kojeg dana, pa mora biti stabilan.
      // GeoNames id je trajni identitet naselja.
      .sort((a, b) => Number(a.code) - Number(b.code));

    places[tier] = rows.map((r, id) => ({
      id,
      code: r.code,
      name: r.name,
      lat: round(r.lat),
      lon: round(r.lon),
    }));
  }

  const { outline, counties } = await buildOutline();
  return { places, outline, counties, dropped };
}

/** Obris države i županijske linije za podlogu. SPEC §4.4. */
async function buildOutline(): Promise<{
  outline: GeoJSON.FeatureCollection;
  counties: GeoJSON.FeatureCollection;
}> {
  const source = await readCached(NE_ADMIN1.file);

  const out = await mapshaper.applyCommands(
    [
      '-i input.geojson',
      '-filter "adm0_a3 === \'HRV\'"',
      '-simplify visvalingam 30% keep-shapes',
      '-filter-fields name',
      /*
       * `gj2008` je obavezan. Mapshaper inače piše RFC 7946, gdje je vanjski
       * prsten obrnut od kazaljke na satu; d3-geo je stariji i očekuje suprotno,
       * pa takav poligon tumači kao cijelu sferu bez Hrvatske — `geoArea` ispadne
       * 12,57 sr umjesto 0,0014, `fitExtent` se sruši na skalu 0,004 i karta
       * nestane u jednu točku.
       */
      '-o gj2008 counties.json',
      '-dissolve',
      '-o gj2008 outline.json',
    ].join(' '),
    { 'input.geojson': source },
  );

  const counties = out['counties.json'];
  const outline = out['outline.json'];
  if (!counties || !outline) throw new Error('mapshaper nije vratio obris Hrvatske');

  return {
    counties: JSON.parse(counties.toString()) as GeoJSON.FeatureCollection,
    outline: JSON.parse(outline.toString()) as GeoJSON.FeatureCollection,
  };
}

function round(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

export async function writeMissingPopReport(dir: string, dropped: number): Promise<void> {
  const lines = [
    '# Naselja bez podatka o broju stanovnika',
    '',
    `Izostavljeno: **${String(dropped)}** naselja.`,
    '',
    'DGU Registar prostornih jedinica nije dohvaćen — URL nije stabilan i',
    '`fetch-sources.ts` ispisuje uputu za ručni dohvat. Do tada je GeoNames jedini',
    'izvor populacije, a naselja kojima ondje nedostaje broj stanovnika ispadaju iz',
    'oba bazena.',
    '',
    '**Broj stanovnika se ne procjenjuje** — SPEC §4.4. Kad DGU dataset dođe u',
    '`scripts/.cache/`, pipeline ga treba spojiti s ovim popisom po imenu i županiji.',
    '',
  ];
  await writeFile(join(dir, 'MISSING_POP.md'), lines.join('\n'));
}
