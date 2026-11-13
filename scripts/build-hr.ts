/**
 * Hrvatski dio pipelinea. SPEC §4.4.
 *
 * Naselja su točke pa matrica nije potrebna — haversine u runtimeu je trivijalan.
 *
 * **Sva službena naselja** mogu se upisati kao pokušaj (~6 700), a dnevna meta
 * dolazi iz dviju razina, po broju stanovnika iz popisa 2021. Odstupanje od
 * §4.4, koji treću razinu nije gradio: odluka 2026-11-12, DECISIONS.md.
 *
 * Izvor je Wikidata (snimka u `sources/wikidata-naselja.json`). Do tada je bio
 * GeoNames, koji za oko 70 % naselja u Dalmaciji i Lici nema broj stanovnika,
 * pa su ona ispadala iz igre — i mete su bile stalno Slavonija, Podravina i
 * okolica Zagreba.
 */

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import mapshaper from 'mapshaper';

import type { Pool } from '../src/engine/seed';
import { NE_ADMIN1, fetchSource, readCached } from './fetch-sources';
import { SOURCES, type WdSettlement } from './fetch-wikidata';
import { assertContinuity, datedPools, km, nearest, readLegacy, type LegacyPoint } from './pools';

/**
 * Dvije razine meta: toliko najvećih naselja **iz svake od 21 županije**.
 *
 * SPEC §4.4 je birao po pragu (5 000 i 800 stanovnika), a tako dobiven bazen
 * prati gdje su velika sela: 32 % meta bilo je oko Zagreba i na sjeveru, 23 % u
 * Slavoniji, 5 % u Lici. Prijavljeno iz igre kao „uvijek je nešto oko Slavonije,
 * Podravine ili Zagreba". Po županiji svaki kraj dolazi jednako često. Odluka
 * 2026-11-12, DECISIONS.md.
 */
const TIERS = { gradovi: 4, mjesta: 30 } as const;

export type Tier = keyof typeof TIERS;

/** Koordinate se zapisuju kao cijeli brojevi u tisućinkama stupnja, ~100 m. */
export const COORD_SCALE = 1000;

export interface HrPlace {
  name: string;
  lat: number;
  lon: number;
  /** Popis 2021. `null` gdje izvor nema podatak — takvo naselje nije meta. */
  pop: number | null;
}

/** Zapis kakav ide u `public/data/hr-places.json`. Stupci, ne objekti: 6 700 naselja. */
export interface HrPlacesFile {
  names: string[];
  /** Širina × `COORD_SCALE`. */
  lat: number[];
  /** Dužina × `COORD_SCALE`. */
  lon: number[];
  tiers: Record<Tier, { pools: Pool[]; legacy: number[] }>;
}

export interface HrData {
  file: HrPlacesFile;
  places: HrPlace[];
  outline: GeoJSON.FeatureCollection;
  counties: GeoJSON.FeatureCollection;
  /** Naselja bez broja stanovnika: upisuju se, ali nisu mete. */
  withoutPopulation: string[];
  /** Ista imena razlikovana općinom: „Novo Selo (Slunj)". */
  qualified: number;
  continuity: string[];
  /** Mete po županiji i razini, za pregled u MISSING_POP.md. */
  perCounty: Record<string, Record<Tier, string[]>>;
}

/**
 * Popis naselja iz snimke.
 *
 * Službeno naselje je zapis klase „naselje u Hrvatskoj". Središnje naselje
 * grada ili općine u Wikidati je često **isti zapis** kao grad ili općina —
 * Split, Makarska, Punat, Vela Luka — i onda nosi broj stanovnika cijele jedinice
 * (Split 160 577). Takav zapis vrijedi kao naselje samo kad uz popis ima i
 * `urban`, broj za samo naselje (149 830). Bez toga mu središnje naselje nosi
 * drugo ime (općina Muć, naselje Donji Muć) ili ga nema (Kaštela), pa ne ulazi.
 */
export function selectSettlements(rows: WdSettlement[]): (WdSettlement & { pop: number | null })[] {
  const official = rows.filter((r) => r.kind === 'settlement');
  const out = official.map((r) => ({ ...r }));

  const extra = rows
    .filter((r) => r.kind !== 'settlement' && r.urban !== null && !/^(Grad|Općina) /.test(r.name))
    // Veći broj prvi: dva zapisa istog grada (Zaprešić) daju jedno naselje.
    .sort(
      (a, b) => (b.urban ?? 0) - (a.urban ?? 0) || Number(a.qid.slice(1)) - Number(b.qid.slice(1)),
    );

  for (const r of extra) {
    const twin = out.find((o) => o.name === r.name && km(o, r) < 10);
    if (twin) {
      // Naselje već postoji kao zaseban zapis; grad mu samo popuni broj ako ga nema.
      twin.pop ??= r.urban;
      continue;
    }
    out.push({ ...r, pop: r.urban, kind: 'settlement' });
  }

  return out.sort((a, b) => Number(a.qid.slice(1)) - Number(b.qid.slice(1)));
}

/** Grad Zagreb je županija, ali u Wikidati nije u klasi županija. */
const ZAGREB = 'Grad Zagreb';

/**
 * Županija svakog naselja, iz Wikidate (izravno ili preko općine). Naseljima
 * Grada Zagreba izvor je ne daje, pa se prepoznaju po općini „Zagreb"; ostalima
 * bez podatka uzima se županija najbližeg naselja.
 *
 * Granice županija iz Natural Eartha za ovo ne valjaju: u v5.1.2 su zastarjele
 * (Knin i Korenica padaju u Zadarsku), a Požeško-slavonska je ondje upisana kao
 * druga „Brodsko-Posavska".
 */
export function countiesOf(
  places: { qid: string; admin: string | null; county: string | null; lat: number; lon: number }[],
): string[] {
  const direct = places.map(
    (p) => p.county ?? (p.admin === 'Zagreb' || p.qid === 'Q1435' ? ZAGREB : null),
  );
  const known = places.flatMap((p, i) => (direct[i] ? [{ ...p, county: direct[i] }] : []));
  return places.map((p, i) => direct[i] ?? known[nearest(known, p)]?.county ?? ZAGREB);
}

/** „Grad Nin" i „Općina Ston" su nazivi jedinica; u zagradi stoji samo ime. */
const bareAdmin = (s: string): string => s.replace(/^(Grad|Općina) /, '');

/**
 * Ista imena se razlikuju dodatkom u zagradi. Igrač upisuje ime, ne
 * koordinatu; bez ovoga je jedno od dvaju „Novih Sela" nepogodivo. Prije se
 * zadržavalo samo najmnogoljudnije, ali uz sva naselja to bi izbacilo ~300 njih.
 *
 * - Daleko najveće među imenjacima zadržava golo ime: Opatija je grad od 5 700
 *   ljudi, a „Opatija (Pokupsko)" selo od 139. Tko upiše „Opatija", misli na grad.
 * - Ostali dobivaju općinu: „Lipovac (Nijemci)".
 * - Gdje je i općina ista ili je nema (Privlaka je općina i u Zadarskoj i u
 *   Vukovarsko-srijemskoj), ide županija: „Privlaka (Zadarska županija)".
 */
export function qualifyDuplicates(
  places: { name: string; admin: string | null; county: string; pop: number | null }[],
): string[] {
  const groups = new Map<string, number[]>();
  for (const [i, p] of places.entries()) groups.set(p.name, [...(groups.get(p.name) ?? []), i]);

  const out = places.map((p) => p.name);
  for (const [name, ids] of groups) {
    if (ids.length < 2) continue;
    const byPop = [...ids].sort((a, b) => (places[b]?.pop ?? 0) - (places[a]?.pop ?? 0));
    const [first, second] = byPop.map((i) => places[i]?.pop ?? 0);
    const keepBare =
      (first ?? 0) >= 1000 && (first ?? 0) >= 3 * (second ?? 0) ? byPop[0] : undefined;

    const rest = ids.filter((i) => i !== keepBare);
    const admin = (i: number): string | null => {
      const a = places[i]?.admin;
      return a && bareAdmin(a) !== name ? bareAdmin(a) : null;
    };
    const admins = rest.map(admin);
    const unique = admins.every((a, k) => a !== null && admins.indexOf(a) === k);
    for (const i of rest) {
      out[i] = `${name} (${(unique ? admin(i) : null) ?? places[i]?.county ?? ''})`;
    }
  }

  // Dva naselja s istim imenom u istoj županiji i bez općine: dodaj općinu i županiju.
  const seen = new Map<string, number>();
  for (const n of out) seen.set(n, (seen.get(n) ?? 0) + 1);
  return out.map((n, i) => {
    if ((seen.get(n) ?? 0) < 2) return n;
    const p = places[i];
    return p?.admin ? `${p.name} (${bareAdmin(p.admin)}, ${p.county})` : n;
  });
}

function readSnapshot(): WdSettlement[] {
  return JSON.parse(readFileSync(join(SOURCES, 'wikidata-naselja.json'), 'utf8')) as WdSettlement[];
}

/**
 * Staro mjesto (iz GeoNamesa) → novo naselje: isto ime unutar 5 km, inače
 * najbliže. GeoNames je imao i dijelove naselja („Podstrana - Miljevac"), pa za
 * njih nema imenjaka; najbliže naselje je ono u kojem taj dio leži.
 */
function mapLegacy(old: LegacyPoint[], places: HrPlace[], names: string[]): number[] {
  const bare = names.map((n) => n.replace(/ \(.*\)$/, ''));
  return old.map((o) => {
    let best = -1;
    let bestKm = Infinity;
    for (const [i, p] of places.entries()) {
      if (bare[i] !== o.name) continue;
      const d = km(o, p);
      if (d < 5 && d < bestKm) {
        best = i;
        bestKm = d;
      }
    }
    return best >= 0 ? best : nearest(places, o);
  });
}

export async function buildHr(): Promise<HrData> {
  const admin1 = await fetchSource(NE_ADMIN1);
  if (!admin1) throw new Error('Natural Earth admin 1 nije dostupan');

  const selected = selectSettlements(readSnapshot());
  const countyNames = countiesOf(selected);
  const names = qualifyDuplicates(
    selected.map((s, i) => ({ ...s, county: countyNames[i] ?? ZAGREB })),
  );
  if (new Set(names).size !== names.length) throw new Error('Dva naselja i dalje imaju isto ime');
  const places: HrPlace[] = selected.map((s, i) => ({
    name: names[i] ?? s.name,
    lat: s.lat,
    lon: s.lon,
    pop: s.pop,
  }));

  const regions = [...new Set(countyNames)].sort((a, b) => a.localeCompare(b, 'hr'));
  if (regions.length !== 21)
    throw new Error(`Očekivana 21 županija, nađeno ${String(regions.length)}`);
  const county = countyNames.map((c) => regions.indexOf(c));

  /*
   * Unutar županije po broju stanovnika, pa po Wikidata ID-u kad je isto —
   * da izbor bude isti pri svakom pokretanju.
   */
  const ranked = places
    .map((p, i) => ({ i, pop: p.pop, county: county[i] ?? -1 }))
    .filter((r): r is { i: number; pop: number; county: number } => r.pop !== null)
    .sort((a, b) => b.pop - a.pop || a.i - b.i);

  const legacy = readLegacy();
  const tiers = {} as HrPlacesFile['tiers'];
  const continuity: string[] = [];
  const perCounty: Record<string, Record<Tier, string[]>> = {};
  for (const [tier, take] of Object.entries(TIERS) as [Tier, number][]) {
    const taken = new Map<number, number>();
    const chosen: number[] = [];
    for (const r of ranked) {
      const have = taken.get(r.county) ?? 0;
      if (have >= take) continue;
      taken.set(r.county, have + 1);
      chosen.push(r.i);
      const name = regions[r.county] ?? '?';
      perCounty[name] ??= { gradovi: [], mjesta: [] };
      perCounty[name][tier].push(places[r.i]?.name ?? '');
    }
    /*
     * Poredak određuje koja je meta kojeg dana, pa mora biti stabilan: naselja
     * su poredana po Wikidata ID-u, koji je trajni identitet zapisa.
     */
    const next = chosen.sort((a, b) => a - b);
    const old = legacy[tier];
    const legacyIds = mapLegacy(old, places, names);
    const pools = datedPools(legacyIds, next);
    continuity.push(
      ...assertContinuity(`hr/${tier}`, 'hr', old.length, pools, (o, n) => {
        const was = old[o]?.name;
        return was !== undefined && places[n]?.name.replace(/ \(.*\)$/, '') === was;
      }),
    );
    tiers[tier] = { pools, legacy: legacyIds };
  }

  const file: HrPlacesFile = {
    names: places.map((p) => p.name),
    lat: places.map((p) => Math.round(p.lat * COORD_SCALE)),
    lon: places.map((p) => Math.round(p.lon * COORD_SCALE)),
    tiers,
  };

  const { outline, counties } = await buildOutline();
  return {
    file,
    places,
    outline,
    counties,
    withoutPopulation: places.filter((p) => p.pop === null).map((p) => p.name),
    qualified: names.filter((n, i) => n !== selected[i]?.name).length,
    continuity,
    perCounty,
  };
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

export async function writeMissingPopReport(dir: string, names: string[]): Promise<void> {
  const lines = [
    '# Naselja bez podatka o broju stanovnika',
    '',
    `Ukupno: **${String(names.length)}** naselja.`,
    '',
    'Wikidata za njih nema broj stanovnika iz popisa 2021. Mogu se upisati kao',
    'pokušaj, ali nisu dnevna meta ni u jednoj razini, jer razina ide po broju',
    'stanovnika. **Broj stanovnika se ne procjenjuje** — SPEC §4.4.',
    '',
    ...names.map((n) => `- ${n}`),
    '',
  ];
  await writeFile(join(dir, 'MISSING_POP.md'), lines.join('\n'));
}
