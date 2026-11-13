import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildCapitals, cleanLabel, type Capital } from '../../scripts/build-capitals';
import type { WdCapital, WdCountry } from '../../scripts/fetch-wikidata';
import type { Legacy } from '../../scripts/pools';
import { targetFor } from '../../src/engine/seed';

/**
 * Bazen glavnih gradova. Wikidata kaže koji je grad glavni, CLDR i Wikidata
 * daju hrvatski naziv. Prijavljeno iz igre: imena nisu ažurna, krivi gradovi
 * (Nur-Sultan, Dar es Salaam), a Južnoafrička Republika nije bila u igri.
 */

/** Dan nakon prijelaza: provjera kontinuiteta tada nema što provjeriti. */
const AFTER = '2026-12-01';

function cap(
  qid: string,
  en: string,
  lat: number,
  lon: number,
  extra: Partial<WdCapital> = {},
): WdCapital {
  return { qid, hr: null, en, lat, lon, rank: 'normal', ...extra };
}

function wd(...countries: WdCountry[]): Map<string, WdCountry> {
  return new Map(countries.map((c) => [c.qid, c]));
}

const HRV = { iso: 'HRV', a2: 'HR', name: 'Hrvatska', qid: 'Q224' };

describe('cleanLabel', () => {
  it('skida razlikovni dodatak iz naslova članka', () => {
    expect(cleanLabel('San José, Kostarika')).toBe('San José');
    expect(cleanLabel('Juba, grad')).toBe('Juba');
    expect(cleanLabel('Victoria (Sejšeli)')).toBe('Victoria');
    expect(cleanLabel('Zagreb')).toBe('Zagreb');
  });
});

describe('buildCapitals', () => {
  it('spaja grad na državu preko Wikidata ID-a', () => {
    const { capitals } = buildCapitals(
      [HRV],
      wd({ qid: 'Q224', hr: 'Hrvatska', capitals: [cap('Q1435', 'Zagreb', 45.81, 15.98)] }),
      [],
      AFTER,
    );
    expect(capitals).toHaveLength(1);
    expect(capitals[0]).toMatchObject({ code: 'HRV', name: 'Zagreb', country: 'Hrvatska' });
    expect(capitals[0]?.lat).toBeCloseTo(45.81, 2);
  });

  it('CLDR-ov hrvatski egzonim ima prednost', () => {
    // Beč, ne Vienna: CLDR ga vodi kao „exemplar city" zone Europe/Vienna.
    const { capitals } = buildCapitals(
      [{ iso: 'AUT', a2: 'AT', name: 'Austrija', qid: 'Q40' }],
      wd({
        qid: 'Q40',
        hr: 'Austrija',
        capitals: [cap('Q1741', 'Vienna', 48.2, 16.37, { hr: 'Beč' })],
      }),
      [],
      AFTER,
    );
    expect(capitals[0]?.name).toBe('Beč');
  });

  it('bez CLDR-a ide Wikidatin hrvatski naziv', () => {
    const { capitals, withoutCroatianName } = buildCapitals(
      [{ iso: 'CHN', a2: 'CN', name: 'Kina', qid: 'Q148' }],
      wd({
        qid: 'Q148',
        hr: 'Kina',
        capitals: [cap('Q956', 'Beijing', 39.9, 116.4, { hr: 'Peking' })],
      }),
      [],
      AFTER,
    );
    expect(capitals[0]?.name).toBe('Peking');
    expect(withoutCroatianName).toEqual([]);
  });

  it('enciklopedija ima prednost gdje se izvori razilaze', () => {
    // hr.wikipedia „Kaapstad", Hrvatska enciklopedija „Cape Town".
    const { capitals, aliases } = buildCapitals(
      [{ iso: 'ZAF', a2: 'ZA', name: 'Južnoafrička Republika', qid: 'Q258' }],
      wd({
        qid: 'Q258',
        hr: null,
        capitals: [cap('Q5465', 'Cape Town', -33.9, 18.4, { hr: 'Kaapstad' })],
      }),
      [],
      AFTER,
    );
    expect(capitals[0]?.name).toBe('Cape Town');
    expect(aliases.Kaapstad).toBe('Cape Town');
  });

  it('država s više glavnih gradova ostaje u igri sa svima', () => {
    const { capitals, pools, multiple } = buildCapitals(
      [{ iso: 'ZAF', a2: 'ZA', name: 'Južnoafrička Republika', qid: 'Q258' }, HRV],
      wd(
        {
          qid: 'Q258',
          hr: null,
          capitals: [
            cap('Q3926', 'Pretoria', -25.75, 28.19),
            cap('Q37701', 'Bloemfontein', -29.12, 26.21),
            cap('Q5465', 'Cape Town', -33.92, 18.42),
          ],
        },
        { qid: 'Q224', hr: null, capitals: [cap('Q1435', 'Zagreb', 45.81, 15.98)] },
      ),
      [],
      AFTER,
    );
    expect(capitals.filter((c) => c.code === 'ZAF').map((c) => c.name)).toEqual([
      'Bloemfontein',
      'Cape Town',
      'Pretoria',
    ]);
    expect(multiple).toHaveLength(1);
    // Bazen ima državu jednom: tri grada nisu tri mete.
    expect(pools[1]?.ids.map((id) => capitals[id]?.code)).toEqual(['ZAF', 'HRV']);
  });

  it('grad s prednošću u izvoru je prvi', () => {
    const { capitals } = buildCapitals(
      [{ iso: 'MYS', a2: 'MY', name: 'Malezija', qid: 'Q833' }],
      wd({
        qid: 'Q833',
        hr: null,
        capitals: [
          cap('Q1001', 'Putrajaya', 2.93, 101.69),
          cap('Q1865', 'Kuala Lumpur', 3.14, 101.69, { rank: 'preferred' }),
        ],
      }),
      [],
      AFTER,
    );
    expect(capitals[0]?.name).toBe('Kuala Lumpur');
  });

  it('staro ime je upis samo ako je isti grad', () => {
    const legacy: Legacy['capitals'] = [
      { code: 'KAZ', name: 'Nur-Sultan', lat: 51.18, lon: 71.43 },
      { code: 'TZA', name: 'Dar es Salaam', lat: -6.8, lon: 39.27 },
    ];
    const { aliases } = buildCapitals(
      [
        { iso: 'KAZ', a2: 'KZ', name: 'Kazahstan', qid: 'Q232' },
        { iso: 'TZA', a2: 'TZ', name: 'Tanzanija', qid: 'Q924' },
      ],
      wd(
        { qid: 'Q232', hr: null, capitals: [cap('Q1520', 'Astana', 51.17, 71.45)] },
        { qid: 'Q924', hr: null, capitals: [cap('Q3866', 'Dodoma', -6.17, 35.74)] },
      ),
      legacy,
      AFTER,
    );
    expect(aliases['Nur-Sultan']).toBe('Astana');
    // Dar es Salaam je drugi grad, 400 km dalje — upis bi lagao.
    expect(aliases['Dar es Salaam']).toBeUndefined();
  });

  it('stari indeks vodi na isti grad u novom popisu', () => {
    const legacy: Legacy['capitals'] = [
      { code: 'BEN', name: 'Cotonou', lat: 6.36, lon: 2.4 },
      { code: 'HRV', name: 'Zagreb', lat: 45.8, lon: 16 },
    ];
    const result = buildCapitals(
      [{ iso: 'BEN', a2: 'BJ', name: 'Benin', qid: 'Q962' }, HRV],
      wd(
        {
          qid: 'Q962',
          hr: null,
          capitals: [
            cap('Q3799', 'Porto-Novo', 6.5, 2.6, { rank: 'preferred' }),
            cap('Q43595', 'Cotonou', 6.37, 2.43),
          ],
        },
        { qid: 'Q224', hr: null, capitals: [cap('Q1435', 'Zagreb', 45.81, 15.98)] },
      ),
      legacy,
      AFTER,
    );
    expect(result.legacy.map((id) => result.capitals[id]?.name)).toEqual(['Cotonou', 'Zagreb']);
  });

  it('do prijelaza novi račun daje istu metu kao stari', () => {
    const legacy: Legacy['capitals'] = [
      { code: 'HRV', name: 'Zagreb', lat: 45.8, lon: 16 },
      { code: 'AUT', name: 'Beč', lat: 48.2, lon: 16.37 },
    ];
    const countries = [HRV, { iso: 'AUT', a2: 'AT', name: 'Austrija', qid: 'Q40' }];
    const source = wd(
      { qid: 'Q224', hr: null, capitals: [cap('Q1435', 'Zagreb', 45.81, 15.98)] },
      { qid: 'Q40', hr: null, capitals: [cap('Q1741', 'Vienna', 48.2, 16.37)] },
    );
    const result = buildCapitals(countries, source, legacy, '2026-11-12');
    for (const date of ['2026-11-12', '2026-11-13'] as const) {
      const id = targetFor(date, 'capitals', result.pools);
      expect(result.capitals[id]?.code).toBeDefined();
    }
    expect(result.continuity).toHaveLength(2);
  });

  it('isti ulaz daje isti izlaz', () => {
    // Nestabilan poredak pomaknuo bi mete pri svakom `pnpm data`.
    const source = wd({ qid: 'Q224', hr: null, capitals: [cap('Q1435', 'Zagreb', 45.81, 15.98)] });
    expect(buildCapitals([HRV], source, [], AFTER)).toEqual(
      buildCapitals([HRV], source, [], AFTER),
    );
  });
});

describe('generirani bazen', () => {
  const path = join(import.meta.dirname, '..', '..', 'public', 'data', 'capitals.json');
  const built = existsSync(path);
  const data = built
    ? (JSON.parse(readFileSync(path, 'utf8')) as {
        n: number;
        capitals: Capital[];
        pools: { from: string; ids: number[] }[];
      })
    : null;

  it('postoji nakon `pnpm data`', () => {
    expect(built, 'pokreni `pnpm data` prije testa').toBe(true);
  });

  it.skipIf(!built)('svaka država je u novom bazenu točno jednom', () => {
    const ids = data?.pools[1]?.ids ?? [];
    const codes = ids.map((id) => data?.capitals[id]?.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThan(60);
  });

  it.skipIf(!built)('svaki grad ima ime i koordinate u rasponu, i nijedno ime dvaput', () => {
    for (const c of data?.capitals ?? []) {
      expect(c.name.length, c.code).toBeGreaterThan(1);
      expect(Math.abs(c.lat), c.name).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lon), c.name).toBeLessThanOrEqual(180);
    }
    const names = (data?.capitals ?? []).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.skipIf(!built)('gradovi su sadašnji, ne iz 2018.', () => {
    const names = (code: string): string[] =>
      (data?.capitals ?? []).filter((c) => c.code === code).map((c) => c.name);

    expect(names('HRV')).toEqual(['Zagreb']);
    expect(names('AUT')).toEqual(['Beč']);
    expect(names('KAZ')).toEqual(['Astana']);
    expect(names('TZA')).toEqual(['Dodoma']);
    expect(names('ENG')).toEqual(['London']);
    expect(names('SCT')).toEqual(['Edinburgh']);
    expect(names('ZAF').sort()).toEqual(['Bloemfontein', 'Cape Town', 'Pretoria']);
  });
});
