/**
 * Glavni gradovi svijeta — treći bazen meta.
 *
 * Izvori, oba već u projektu: Natural Earth za grad i koordinate, Unicode CLDR
 * za hrvatski naziv. Ništa se ne izmišlja — grad bez potvrđenog hrvatskog naziva
 * zadržava izvorni i zapisuje se u `MISSING_CAPITALS_HR.md`, kako SPEC §4.2 traži
 * za nesigurne egzonime.
 *
 * Matrica udaljenosti ovdje ne treba: gradovi su točke, pa je haversine u
 * runtimeu trivijalan — isto kao za naselja u modu Hrvatska. SPEC §4.4.
 */

import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

/** Zapis kakav ide u `public/data/capitals.json`. */
export interface Capital {
  id: number;
  /** ISO3 države kojoj je grad glavni — ujedno i ključ prema `world-meta.json`. */
  code: string;
  name: string;
  /** Hrvatski naziv države, za očitanje u sučelju. */
  country: string;
  lat: number;
  lon: number;
}

interface PlaceProperties {
  FEATURECLA?: string;
  NAME?: string;
  NAME_EN?: string;
  NAMEASCII?: string;
  NAMEALT?: string;
  ADM0_A3?: string;
  SOV_A3?: string;
  ISO_A3?: string;
}

interface PlaceFeature {
  properties: PlaceProperties;
  geometry: { type: string; coordinates: number[] };
}

interface Country {
  iso: string;
  name: string;
}

interface ZoneNode {
  exemplarCity?: string;
  [key: string]: unknown;
}

/**
 * Hrvatski nazivi gradova iz CLDR-a, po IANA vremenskoj zoni.
 *
 * CLDR ih vodi kao „exemplar city" uz svaku zonu — to je jedini izvor hrvatskih
 * egzonima za gradove koji je u projektu, i isti paket obitelji iz kojeg već
 * dolaze nazivi država. Ondje su Beč, Prag, Varšava, Kopenhagen i Kijev.
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
 * Grad → IANA zona, po zadnjem segmentu imena zone.
 *
 * Mehanički, ne procijenjeno: `Europe/Vienna` je grad „Vienna". Natural Earthovo
 * polje `TIMEZONE` se **ne** koristi — u 110m sloju je neispravno (Prag ondje
 * ima `America/Chicago`, Moskva nema ništa).
 */
function zonesByCity(): Map<string, string> {
  const out = new Map<string, string>();
  for (const zone of Intl.supportedValuesOf('timeZone')) {
    const city = zone.split('/').pop()?.replaceAll('_', ' ');
    if (city && !out.has(city)) out.set(city, zone);
  }
  return out;
}

export interface CapitalsResult {
  capitals: Capital[];
  /** Države iz bazena koje u izvoru nemaju glavni grad. */
  withoutCapital: string[];
  /** Države s više od jednog glavnog grada u izvoru — izbačene kao dvojbene. */
  ambiguous: { country: string; cities: string[] }[];
  /** Gradovi koji su zadržali izvorni naziv jer hrvatski nije potvrđen. */
  withoutCroatianName: { name: string; country: string }[];
}

/**
 * Gradi popis glavnih gradova za države koje su već u svjetskom bazenu.
 *
 * Poredak prati `countries`, koji je sortiran po ISO kodu — bez stabilnog
 * poretka svaki bi `pnpm data` pomaknuo sve mete. Isti razlog kao kod država.
 */
export function buildCapitals(geojson: string, countries: Country[]): CapitalsResult {
  const features = (JSON.parse(geojson) as { features: PlaceFeature[] }).features;

  /*
   * Izvor razlikuje `Admin-0 capital` od `Admin-0 capital alt`: prvo je stvarno
   * sjediste, drugo ustavno. Uzima se samo prvo, pa Benin daje Cotonou a ne
   * Porto-Novo — to je klasifikacija izvora, ne nasa procjena.
   */
  const byIso = new Map<string, PlaceFeature[]>();
  for (const feature of features) {
    if (feature.properties.FEATURECLA !== 'Admin-0 capital') continue;
    const key =
      feature.properties.ADM0_A3 ?? feature.properties.SOV_A3 ?? feature.properties.ISO_A3;
    if (!key || key === '-99') continue;
    byIso.set(key, [...(byIso.get(key) ?? []), feature]);
  }

  const cities = croatianCities();
  const zones = zonesByCity();

  const capitals: Capital[] = [];
  const withoutCapital: string[] = [];
  const ambiguous: { country: string; cities: string[] }[] = [];
  const withoutCroatianName: { name: string; country: string }[] = [];

  for (const country of countries) {
    const found = byIso.get(country.iso) ?? [];

    /*
     * Cetiri drzave imaju vise gradova oznacenih kao glavni: Juzna Afrika ima tri
     * ustavne, a Bolivija, Obala Bjelokosti i Mijanmar imaju podijeljeno de jure
     * i de facto sjediste. U kvizu je dvojben odgovor gori od nikakvog, pa
     * ispadaju iz bazena — isto nacelo po kojem se broj stanovnika ne procjenjuje.
     */
    if (found.length > 1) {
      ambiguous.push({
        country: `${country.iso} ${country.name}`,
        cities: found.map((f) => f.properties.NAME_EN ?? f.properties.NAME ?? '?'),
      });
      continue;
    }

    const feature = found[0];
    if (!feature) {
      // Antarktika, Zapadna Sahara, Falklandi i slicni nemaju suvereni glavni
      // grad. To nije rupa u podacima nego tocan odgovor, pa ispadaju iz bazena.
      withoutCapital.push(`${country.iso} ${country.name}`);
      continue;
    }

    const props = feature.properties;
    const source = props.NAME_EN ?? props.NAME;
    const [lon, lat] = feature.geometry.coordinates;
    if (!source || lon === undefined || lat === undefined) {
      withoutCapital.push(`${country.iso} ${country.name}`);
      continue;
    }

    /*
     * Zona se traži kroz sva imena koja Natural Earth nosi: `NAME` je endonim
     * (København), `NAME_EN` engleski (Copenhagen), `NAMEASCII` bez dijakritika
     * (Kiev, dok je NAME već Kyiv). Bez toga ispadnu Kopenhagen i Kijev.
     */
    const zone = [props.NAME_EN, props.NAME, props.NAMEASCII, props.NAMEALT]
      .filter((n): n is string => typeof n === 'string')
      .map((n) => zones.get(n))
      .find((z): z is string => z !== undefined);

    const croatian = zone ? cities.get(zone) : undefined;
    if (!croatian) withoutCroatianName.push({ name: source, country: country.name });

    capitals.push({
      id: capitals.length,
      code: country.iso,
      name: croatian ?? source,
      country: country.name,
      lat: round(lat),
      lon: round(lon),
    });
  }

  return { capitals, withoutCapital, ambiguous, withoutCroatianName };
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
    'Generira `pnpm data`. Ovi gradovi zadrzavaju naziv iz Natural Eartha jer CLDR',
    'za njih nema hrvatski egzonim. Vecina ih ni ne treba — Zagreb, Madrid i Ottawa',
    'se u hrvatskom pisu jednako — ali popis stoji da odstupanje bude vidljivo.',
    '',
    `Ukupno: ${String(result.withoutCroatianName.length)} od ${String(result.capitals.length)}.`,
    '',
    '| Grad | Drzava |',
    '| --- | --- |',
    ...result.withoutCroatianName.map((c) => `| ${c.name} | ${c.country} |`),
    '',
    '## Drzave s vise od jednog glavnog grada',
    '',
    'Izvor im daje vise gradova oznacenih kao glavni — ustavno i stvarno sjediste',
    'nisu isti. Dvojben odgovor u kvizu je gori od nikakvog, pa ispadaju iz bazena.',
    '',
    ...result.ambiguous.map((a) => `- ${a.country}: ${a.cities.join(', ')}`),
    '',
    '## Drzave bez glavnog grada u izvoru',
    '',
    'Nemaju suvereni glavni grad (Antarktika, prekomorski teritoriji, sporna',
    'podrucja), pa ispadaju iz bazena. To nije rupa u podacima.',
    '',
    ...result.withoutCapital.map((c) => `- ${c}`),
    '',
  ];
  await writeFile(join(here, 'MISSING_CAPITALS_HR.md'), lines.join('\n'), 'utf8');
}
