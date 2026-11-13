/**
 * Glavni gradovi svijeta — treći bazen meta.
 *
 * Izvori: **Wikidata** za to koji je grad glavni i gdje je (svojstvo P36, samo
 * izjave bez datuma završetka), **Unicode CLDR** za hrvatski naziv gdje ga ima,
 * pa Wikidatin hrvatski naziv. Ništa se ne izmišlja — grad bez potvrđenog
 * hrvatskog naziva zadržava izvorni i zapisuje se u `MISSING_CAPITALS_HR.md`.
 *
 * Do 2026-11 izvor je bio Natural Earth 110m, čiji su podaci iz 2018. i stariji:
 * Kazahstan je ondje imao Nur-Sultan, Tanzanija Dar es Salaam, Burundi
 * Bujumburu, Palau Melekeok. Wikidata nosi sadašnje stanje.
 *
 * Država s više službenih glavnih gradova (Južnoafrička Republika ima tri) više
 * ne ispada iz bazena: svaki se može upisati i svaki je pogodak. Meta je
 * država, a grad samo način da se do nje dođe — isto pravilo kao „pogodak je
 * identitet mete".
 */

import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { Pool } from '../src/engine/seed';
import type { DateString } from '../src/engine/time';
import { normalize } from '../src/engine/search';
import type { WdCountry } from './fetch-wikidata';
import { assertContinuity, datedPools, km, nearest, type Legacy } from './pools';

const require = createRequire(import.meta.url);

/** Zapis kakav ide u `public/data/capitals.json`. */
export interface Capital {
  id: number;
  /** Kod države kojoj je grad glavni — ujedno i ključ prema `world-meta.json`. */
  code: string;
  /** Alpha-2 iste države, za zastavicu. */
  a2: string;
  name: string;
  /** Hrvatski naziv države, za očitanje u sučelju. */
  country: string;
  lat: number;
  lon: number;
}

interface Country {
  iso: string;
  a2?: string;
  name: string;
  qid: string;
}

interface ZoneNode {
  exemplarCity?: string;
  [key: string]: unknown;
}

/**
 * Hrvatski nazivi gradova iz CLDR-a, po IANA vremenskoj zoni. CLDR ih vodi kao
 * „exemplar city" uz svaku zonu: Beč, Prag, Varšava, Džakarta, Kuvajt.
 */
function croatianCities(): Map<string, string> {
  const data = require('cldr-dates-full/main/hr/timeZoneNames.json') as {
    main: { hr: { dates: { timeZoneNames: { zone: Record<string, unknown> } } } };
  };

  const out = new Map<string, string>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== 'object') continue;
      const path = prefix ? `${prefix}/${key}` : key;
      const zone = value as ZoneNode;
      if (typeof zone.exemplarCity === 'string') out.set(path, zone.exemplarCity);
      else walk(value as Record<string, unknown>, path);
    }
  };
  walk(data.main.hr.dates.timeZoneNames.zone, '');
  return out;
}

/**
 * Gdje se hrvatska Wikipedija i Hrvatska enciklopedija (Leksikografski zavod)
 * razilaze, vrijedi enciklopedija. Samo s izvorom, po Wikidata ID-u grada.
 *
 * - Q5465: hr.wikipedia vodi „Kaapstad", enciklopedija.hr natuknicu „Cape Town"
 *   (provjereno 2026-11-12). Kaapstad ostaje upis.
 */
const ENCYCLOPEDIA_NAMES: Record<string, string> = { Q5465: 'Cape Town' };

/**
 * Grad → IANA zona, po zadnjem segmentu imena zone, bez dijakritika: `Europe/
 * Vienna` je grad „Vienna", a Wikidatin „Panamá" nalazi `America/Panama`.
 */
function zonesByCity(): Map<string, string> {
  const out = new Map<string, string>();
  for (const zone of Intl.supportedValuesOf('timeZone')) {
    const city = zone.split('/').pop()?.replaceAll('_', ' ');
    if (city && !out.has(normalize(city))) out.set(normalize(city), zone);
  }
  return out;
}

/**
 * Wikidatin hrvatski naziv bez razlikovnog dodatka: „San José, Kostarika",
 * „Victoria, Sejšeli" i „Juba, grad" su naslovi članaka, ne imena gradova.
 */
export function cleanLabel(label: string): string {
  return label
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/,.*$/, '')
    .trim();
}

export interface CapitalsResult {
  capitals: Capital[];
  pools: Pool[];
  /** Stari id → novi id. Za partije spremljene prije prijelaza. */
  legacy: number[];
  /** Drugi oblici imena koji se prihvaćaju kao upis → prikazno ime. */
  aliases: Record<string, string>;
  /** Države iz bazena koje u izvoru nemaju glavni grad. */
  withoutCapital: string[];
  /** Države s više službenih glavnih gradova. Svi su u igri. */
  multiple: { country: string; cities: string[] }[];
  /** Gradovi koji su zadržali izvorni naziv jer hrvatski nije potvrđen. */
  withoutCroatianName: { name: string; country: string }[];
  continuity: string[];
}

/**
 * Gradi popis glavnih gradova za države koje su već u svjetskom bazenu.
 *
 * Poredak prati `countries`, koji je sortiran po kodu — bez stabilnog poretka
 * svaki bi `pnpm data` pomaknuo sve mete. Unutar države prvi je grad koji
 * Wikidata vodi s prednošću, pa ostali abecedno.
 */
export function buildCapitals(
  countries: Country[],
  wikidata: Map<string, WdCountry>,
  legacy: Legacy['capitals'],
  today?: DateString,
): CapitalsResult {
  const cities = croatianCities();
  const zones = zonesByCity();

  const capitals: Capital[] = [];
  const aliasCandidates: [string, string][] = [];
  const withoutCapital: string[] = [];
  const multiple: { country: string; cities: string[] }[] = [];
  const withoutCroatianName: { name: string; country: string }[] = [];

  for (const country of countries) {
    const found = wikidata.get(country.qid)?.capitals ?? [];
    if (found.length === 0) {
      withoutCapital.push(`${country.iso} ${country.name}`);
      continue;
    }

    const named = found.map((cap) => {
      const zone = [cap.en, cap.hr]
        .filter((n): n is string => Boolean(n))
        .map((n) => zones.get(normalize(cleanLabel(n))))
        .find((z): z is string => z !== undefined);
      const fromCldr = zone ? cities.get(zone) : undefined;
      const fromWikidata = cap.hr ? cleanLabel(cap.hr) : undefined;
      const name = ENCYCLOPEDIA_NAMES[cap.qid] ?? fromCldr ?? fromWikidata ?? cap.en ?? cap.qid;
      if (!fromCldr && !fromWikidata) withoutCroatianName.push({ name, country: country.name });
      return { cap, name };
    });

    named.sort(
      (a, b) =>
        Number(b.cap.rank === 'preferred') - Number(a.cap.rank === 'preferred') ||
        a.name.localeCompare(b.name, 'hr'),
    );
    if (named.length > 1) {
      multiple.push({
        country: `${country.iso} ${country.name}`,
        cities: named.map((n) => n.name),
      });
    }

    const old = legacy.find((l) => l.code === country.iso);
    for (const { cap, name } of named) {
      const place: Capital = {
        id: capitals.length,
        code: country.iso,
        a2: country.a2 ?? '',
        name,
        country: country.name,
        lat: round(cap.lat),
        lon: round(cap.lon),
      };
      capitals.push(place);

      // Očišćeni oblici: „San José, Kostarika" je naslov članka, ne upis.
      for (const other of [cap.en, cap.hr].map((l) => (l ? cleanLabel(l) : null))) {
        if (other) aliasCandidates.push([other, name]);
      }
      // Staro ime ostaje upis samo ako je to isti grad: Nur-Sultan je Astana,
      // ali Dar es Salaam nije Dodoma.
      if (old && km(old, place) < 30) aliasCandidates.push([old.name, name]);
    }
  }

  /* ----------------------------------------------------------- bazen i v1 */

  const firstOf = new Map<string, number>();
  for (const c of capitals) if (!firstOf.has(c.code)) firstOf.set(c.code, c.id);
  const next = [...firstOf.values()];

  const legacyIds = legacy.map((old) => {
    const same = capitals.filter((c) => c.code === old.code);
    const pick = same.length > 0 ? same : capitals;
    const best = pick[nearest(pick, old)];
    if (!best) throw new Error(`Stari grad ${old.name} nema para`);
    return best.id;
  });

  const pools = datedPools(legacyIds, next);
  const continuity = assertContinuity(
    'gradovi svijeta',
    'capitals',
    legacy.length,
    pools,
    (o, n) => legacy[o]?.code === capitals[n]?.code,
    today,
  );

  return {
    capitals,
    pools,
    legacy: legacyIds,
    aliases: unambiguous(aliasCandidates, capitals),
    withoutCapital,
    multiple,
    withoutCroatianName,
    continuity,
  };
}

/**
 * Aliasi bez dvosmislenosti. Alias koji je ujedno ime drugog grada, ili pokazuje
 * na dva različita grada, ispada — bolje „ne znam" nego krivi grad.
 */
function unambiguous(pairs: [string, string][], capitals: Capital[]): Record<string, string> {
  const names = new Set(capitals.map((c) => normalize(c.name)));
  const targets = new Map<string, Set<string>>();
  const original = new Map<string, string>();
  for (const [alias, name] of pairs) {
    const key = normalize(alias);
    if (!key || key === normalize(name)) continue;
    targets.set(key, (targets.get(key) ?? new Set()).add(name));
    original.set(key, alias);
  }
  const out: Record<string, string> = {};
  for (const [key, set] of targets) {
    if (set.size !== 1 || names.has(key)) continue;
    const alias = original.get(key);
    const [name] = [...set];
    if (alias && name) out[alias] = name;
  }
  return out;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Izvjestaj po uzoru na `MISSING_HR.md`. SPEC §4.2. */
export async function writeMissingCapitalsReport(
  here: string,
  result: CapitalsResult,
): Promise<void> {
  const lines = [
    '# Glavni gradovi bez potvrdjenog hrvatskog naziva',
    '',
    'Generira `pnpm data`. Ovi gradovi zadrzavaju izvorni naziv iz Wikidate jer ni',
    'CLDR ni Wikidata za njih nemaju hrvatski oblik. Naziv se ne pogadja — SPEC §4.2.',
    '',
    `Ukupno: ${String(result.withoutCroatianName.length)} od ${String(result.capitals.length)}.`,
    '',
    '| Grad | Drzava |',
    '| --- | --- |',
    ...result.withoutCroatianName.map((c) => `| ${c.name} | ${c.country} |`),
    '',
    '## Drzave s vise sluzbenih glavnih gradova',
    '',
    'Svaki od njih se moze upisati i svaki je pogodak. Meta je drzava.',
    '',
    ...result.multiple.map((a) => `- ${a.country}: ${a.cities.join(', ')}`),
    '',
    '## Drzave bez glavnog grada u izvoru',
    '',
    ...(result.withoutCapital.length > 0
      ? result.withoutCapital.map((c) => `- ${c}`)
      : ['Nijedna.']),
    '',
  ];
  await writeFile(join(here, 'MISSING_CAPITALS_HR.md'), lines.join('\n'), 'utf8');
}
