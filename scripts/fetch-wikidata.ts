/**
 * Snimka Wikidate u `scripts/sources/`. Pokreće se ručno, ne pri svakom buildu:
 *
 *   pnpm sources
 *
 * Wikidata (CC0) je izvor za tri stvari koje ostali izvori nemaju ili imaju
 * zastarjele: hrvatske nazive država, **sadašnje** glavne gradove (Astana, a ne
 * Nur-Sultan; Dodoma, a ne Dar es Salaam) i sva hrvatska naselja s brojem
 * stanovnika iz popisa 2021.
 *
 * Zašto snimka u gitu, a ne dohvat pri buildu: bazen meta određuje niz meta, pa
 * se ne smije mijenjati sam od sebe. Wikidata se uređuje svaki dan, a endpoint
 * zna vratiti 502 — dohvat pri svakom buildu značio bi da deploy može tiho
 * promijeniti sutrašnju metu ili pasti. Snimka se mijenja samo kad je netko
 * osvježi, a razlika se vidi u diffu.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CACHE, NATURAL_EARTH, NE_MAP_UNITS, fetchSource } from './fetch-sources';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCES = join(HERE, 'sources');

const ENDPOINT = 'https://query.wikidata.org/sparql';
/** Generičko ime klijenta. Wikimedia traži User-Agent, ali ne i osobne podatke. */
const USER_AGENT = 'orbis-data-pipeline/1.0';

/** Naselje u Hrvatskoj — službena jedinica iz Registra prostornih jedinica. */
const SETTLEMENT = 'Q4845841';
/** Grad u Hrvatskoj. Središnje naselje grada često je isti zapis. */
const TOWN = 'Q15105893';
/**
 * Općina u Hrvatskoj. Kao i kod gradova, središnje naselje općine u Wikidati je
 * često isti zapis kao i sama općina — Punat, Vela Luka, Kukljica — pa bez
 * ovoga ~350 naselja jednostavno nema.
 */
const MUNICIPALITY = 'Q57058';
/** Županija u Hrvatskoj. Grad Zagreb nije u ovoj klasi; vidi `build-hr.ts`. */
const COUNTY = 'Q57053';

interface Binding {
  type: string;
  value: string;
  'xml:lang'?: string;
}
type Row = Record<string, Binding | undefined>;

async function sparql(query: string, attempt = 1): Promise<Row[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    // Endpoint zna vratiti 502/504 pod opterećenjem; tri pokušaja s razmakom.
    if (attempt < 3 && res.status >= 500) {
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      return sparql(query, attempt + 1);
    }
    throw new Error(`Wikidata HTTP ${String(res.status)}`);
  }
  const body = (await res.json()) as { results: { bindings: Row[] } };
  return body.results.bindings;
}

const qid = (b: Binding | undefined): string => b?.value.split('/').pop() ?? '';

/** `Point(lon lat)` → `[lon, lat]`. */
function point(b: Binding | undefined): [number, number] | null {
  const m = b ? /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.value) : null;
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/* ---------------------------------------------------------------- države */

export interface WdCapital {
  qid: string;
  hr: string | null;
  /** Engleski, ili višejezični `mul` gdje engleskog zapisa nema. */
  en: string | null;
  lon: number;
  lat: number;
  /** `preferred` ili `normal`. Zastarjele (`deprecated`) se ne dohvaćaju. */
  rank: string;
}

export interface WdCountry {
  qid: string;
  hr: string | null;
  capitals: WdCapital[];
}

async function countryQids(): Promise<string[]> {
  const out = new Set<string>();
  for (const source of [NATURAL_EARTH, NE_MAP_UNITS]) {
    const path = await fetchSource(source);
    if (!path) throw new Error(`${source.file} nije dostupan`);
    const fc = JSON.parse(await readFile(join(CACHE, source.file), 'utf8')) as {
      features: { properties: { WIKIDATAID?: string } }[];
    };
    for (const f of fc.features) if (f.properties.WIKIDATAID) out.add(f.properties.WIKIDATAID);
  }
  return [...out].sort();
}

async function fetchCountries(): Promise<WdCountry[]> {
  const qids = await countryQids();
  const byQid = new Map<string, WdCountry>(
    qids.map((q) => [q, { qid: q, hr: null, capitals: [] }]),
  );
  const values = qids.map((q) => `wd:${q}`).join(' ');

  for (const row of await sparql(`
    SELECT ?c ?hr WHERE {
      VALUES ?c { ${values} }
      ?c rdfs:label ?hr FILTER(LANG(?hr) = "hr")
    }`)) {
    const c = byQid.get(qid(row.c));
    if (c && row.hr) c.hr = row.hr.value;
  }

  /*
   * Samo izjave bez datuma završetka (`P582`): bivši glavni grad ostaje u
   * Wikidati kao povijest — Nur-Sultan, Rangun, Dar es Salaam — ali s krajem.
   * Zastarjeli rang se preskače jer znači „pogrešno, ne koristiti".
   */
  for (const row of await sparql(`
    SELECT ?c ?cap ?rank ?coord ?hr ?en ?mul WHERE {
      VALUES ?c { ${values} }
      ?c p:P36 ?st .
      ?st ps:P36 ?cap ; wikibase:rank ?rank .
      FILTER(?rank != wikibase:DeprecatedRank)
      FILTER NOT EXISTS { ?st pq:P582 ?end }
      ?cap wdt:P625 ?coord .
      OPTIONAL { ?cap rdfs:label ?hr FILTER(LANG(?hr) = "hr") }
      OPTIONAL { ?cap rdfs:label ?en FILTER(LANG(?en) = "en") }
      OPTIONAL { ?cap rdfs:label ?mul FILTER(LANG(?mul) = "mul") }
    }`)) {
    const c = byQid.get(qid(row.c));
    const p = point(row.coord);
    if (!c || !p) continue;
    const id = qid(row.cap);
    // Više koordinata za isti grad: prva je dovoljna, grad je točka.
    if (c.capitals.some((x) => x.qid === id)) continue;
    c.capitals.push({
      qid: id,
      hr: row.hr?.value ?? null,
      // Wikidata od 2024. drži ime koje je isto u svim jezicima kao `mul`, pa
      // Oslo, Cardiff i Saint John's nemaju zaseban engleski zapis.
      en: row.en?.value ?? row.mul?.value ?? null,
      lon: round(p[0]),
      lat: round(p[1]),
      rank: (row.rank?.value.split('#').pop() ?? '').replace('Rank', '').toLowerCase(),
    });
  }

  for (const c of byQid.values()) c.capitals.sort((a, b) => a.qid.localeCompare(b.qid));
  return [...byQid.values()];
}

/* ---------------------------------------------------------------- naselja */

export interface WdSettlement {
  qid: string;
  name: string;
  lon: number;
  lat: number;
  /** Popis 2021. `null` gdje Wikidata nema podatak — ne procjenjuje se. */
  pop: number | null;
  /**
   * Stanovnici samog središnjeg naselja, kvalifikator `P6343` uz popis 2021.
   * Zapis grada u `pop` nosi cijelu upravnu jedinicu sa svim prigradskim
   * naseljima — Split 160 577 — a ovdje stoji samo naselje: 149 830.
   */
  urban: number | null;
  /**
   * Općina ili grad kojem naselje pripada, za razlikovanje istih imena. Samo te
   * dvije razine: `P131` nekih naselja pokazuje i na županiju, a „Novo Selo
   * (Istarska županija)" nikoga ne vodi do pravog sela.
   */
  admin: string | null;
  /** Županija, izravno ili preko općine. Za razine meta, koje idu po županiji. */
  county: string | null;
  /**
   * `settlement` je službeno naselje; `town` i `municipality` su zapisi grada i
   * općine, koji vrijede kao naselje samo kad nose `urban` — inače im središnje
   * naselje nosi drugo ime (Muć → Donji Muć) ili ga nema (Kaštela).
   */
  kind: 'settlement' | 'town' | 'municipality';
}

async function fetchSettlements(cls: string, kind: WdSettlement['kind']): Promise<WdSettlement[]> {
  const rows = await sparql(`
    SELECT ?s ?hr ?coord ?pop ?urban ?adminHr ?countyHr WHERE {
      ?s wdt:P31 wd:${cls} ; wdt:P625 ?coord ; rdfs:label ?hr .
      FILTER(LANG(?hr) = "hr")
      OPTIONAL {
        ?s p:P1082 ?st . ?st ps:P1082 ?pop ; pq:P585 ?t .
        FILTER(YEAR(?t) = 2021)
        OPTIONAL { ?st pq:P6343 ?urban }
      }
      OPTIONAL {
        ?s wdt:P131 ?admin .
        ?admin wdt:P31 ?adminClass ; rdfs:label ?adminHr .
        FILTER(?adminClass IN (wd:${MUNICIPALITY}, wd:${TOWN}))
        FILTER(LANG(?adminHr) = "hr")
      }
      OPTIONAL {
        ?s (wdt:P131|wdt:P131/wdt:P131) ?county .
        ?county wdt:P31 wd:${COUNTY} ; rdfs:label ?countyHr .
        FILTER(LANG(?countyHr) = "hr")
      }
    }`);

  const byQid = new Map<string, WdSettlement>();
  for (const row of rows) {
    const id = qid(row.s);
    const p = point(row.coord);
    if (!id || !p || !row.hr) continue;
    const pop = row.pop ? Number(row.pop.value) : null;
    const urban = row.urban ? Number(row.urban.value) : null;
    const existing = byQid.get(id);
    if (existing) {
      // Više redaka po naselju dolazi od više koordinata ili općina. Uzima se
      // najveći broj stanovnika iz 2021. i prva općina abecedno, da snimka
      // bude ista pri svakom dohvatu.
      if (pop !== null && (existing.pop === null || pop > existing.pop)) existing.pop = pop;
      if (urban !== null && (existing.urban === null || urban > existing.urban)) {
        existing.urban = urban;
      }
      const admin = row.adminHr?.value ?? null;
      if (admin && (!existing.admin || admin.localeCompare(existing.admin, 'hr') < 0)) {
        existing.admin = admin;
      }
      const county = row.countyHr?.value ?? null;
      if (county && (!existing.county || county.localeCompare(existing.county, 'hr') < 0)) {
        existing.county = county;
      }
      continue;
    }
    byQid.set(id, {
      qid: id,
      name: row.hr.value,
      lon: round(p[0]),
      lat: round(p[1]),
      pop,
      urban,
      admin: row.adminHr?.value ?? null,
      county: row.countyHr?.value ?? null,
      kind,
    });
  }
  return [...byQid.values()];
}

function round(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

const qnum = (q: string): number => Number(q.slice(1));

async function main(): Promise<void> {
  await mkdir(SOURCES, { recursive: true });

  console.warn('Wikidata: države i glavni gradovi →');
  const countries = await fetchCountries();
  countries.sort((a, b) => qnum(a.qid) - qnum(b.qid));
  await writeFile(
    join(SOURCES, 'wikidata-countries.json'),
    `${JSON.stringify(countries, null, 1)}\n`,
  );
  console.warn(`  ${String(countries.length)} zapisa`);

  console.warn('Wikidata: naselja →');
  const settlements = [
    ...(await fetchSettlements(SETTLEMENT, 'settlement')),
    ...(await fetchSettlements(TOWN, 'town')),
    ...(await fetchSettlements(MUNICIPALITY, 'municipality')),
  ].sort((a, b) => qnum(a.qid) - qnum(b.qid) || a.kind.localeCompare(b.kind));
  await writeFile(
    join(SOURCES, 'wikidata-naselja.json'),
    `${JSON.stringify(settlements, null, 0).replaceAll('},{', '},\n{')}\n`,
  );
  console.warn(`  ${String(settlements.length)} zapisa`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  await main();
  console.warn('Gotovo.');
}
