import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildCapitals, type Capital } from '../../scripts/build-capitals';

/**
 * Bazen glavnih gradova. Dva izvora se ovdje spajaju — Natural Earth za grad i
 * koordinate, CLDR za hrvatski naziv — a spoj ide preko imena, sto je mjesto
 * gdje se tiho gubi po nekoliko gradova odjednom.
 */

/** Minimalan GeoJSON s onim poljima koja pipeline stvarno cita. */
function place(props: Record<string, string>, lon: number, lat: number): unknown {
  return { properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } };
}

function source(features: unknown[]): string {
  return JSON.stringify({ type: 'FeatureCollection', features });
}

describe('buildCapitals', () => {
  it('spaja grad na drzavu preko ISO koda', () => {
    const geojson = source([
      place({ FEATURECLA: 'Admin-0 capital', NAME: 'Zagreb', ADM0_A3: 'HRV' }, 15.98, 45.81),
    ]);
    const { capitals } = buildCapitals(geojson, [{ iso: 'HRV', name: 'Hrvatska' }]);

    expect(capitals).toHaveLength(1);
    expect(capitals[0]).toMatchObject({ code: 'HRV', name: 'Zagreb', country: 'Hrvatska' });
    expect(capitals[0]?.lat).toBeCloseTo(45.81, 2);
    expect(capitals[0]?.lon).toBeCloseTo(15.98, 2);
  });

  it('uzima hrvatski egzonim iz CLDR-a kad postoji', () => {
    // Bec, ne Vienna. Naziv dolazi iz izvora, ne iz glave — SPEC §4.2.
    const geojson = source([
      place(
        { FEATURECLA: 'Admin-0 capital', NAME: 'Vienna', NAME_EN: 'Vienna', ADM0_A3: 'AUT' },
        16.37,
        48.2,
      ),
    ]);
    const { capitals, withoutCroatianName } = buildCapitals(geojson, [
      { iso: 'AUT', name: 'Austrija' },
    ]);

    expect(capitals[0]?.name).toBe('Beč');
    expect(withoutCroatianName).toEqual([]);
  });

  it('nalazi zonu i kad se izvorni zapis razlikuje od imena zone', () => {
    /*
     * Natural Earth za Dansku nosi endonim „København", a IANA zona je
     * `Europe/Copenhagen`. Bez pretrage kroz NAME_EN i NAMEASCII ispali bi
     * Kopenhagen i Kijev, oba s ispravnim hrvatskim nazivom u CLDR-u.
     */
    const geojson = source([
      place(
        {
          FEATURECLA: 'Admin-0 capital',
          NAME: 'København',
          NAME_EN: 'Copenhagen',
          NAMEASCII: 'Kobenhavn',
          ADM0_A3: 'DNK',
        },
        12.57,
        55.68,
      ),
      place(
        {
          FEATURECLA: 'Admin-0 capital',
          NAME: 'Kyiv',
          NAME_EN: 'Kyiv',
          NAMEASCII: 'Kiev',
          ADM0_A3: 'UKR',
        },
        30.52,
        50.45,
      ),
    ]);
    const { capitals } = buildCapitals(geojson, [
      { iso: 'DNK', name: 'Danska' },
      { iso: 'UKR', name: 'Ukrajina' },
    ]);

    expect(capitals.map((c) => c.name)).toEqual(['Kopenhagen', 'Kijev']);
  });

  it('bez hrvatskog naziva zadrzava izvorni i prijavljuje ga', () => {
    const geojson = source([
      place({ FEATURECLA: 'Admin-0 capital', NAME: 'Nuku', NAME_EN: 'Nuku', ADM0_A3: 'XXX' }, 1, 1),
    ]);
    const { capitals, withoutCroatianName } = buildCapitals(geojson, [
      { iso: 'XXX', name: 'Nigdjezemska' },
    ]);

    expect(capitals[0]?.name).toBe('Nuku');
    expect(withoutCroatianName).toEqual([{ name: 'Nuku', country: 'Nigdjezemska' }]);
  });

  it('ustavno sjediste ne preglasava stvarno', () => {
    // Izvor razlikuje `Admin-0 capital` od `Admin-0 capital alt`; uzima se prvo.
    const geojson = source([
      place({ FEATURECLA: 'Admin-0 capital alt', NAME: 'Porto-Novo', ADM0_A3: 'BEN' }, 2.6, 6.5),
      place({ FEATURECLA: 'Admin-0 capital', NAME: 'Cotonou', ADM0_A3: 'BEN' }, 2.43, 6.37),
    ]);
    const { capitals } = buildCapitals(geojson, [{ iso: 'BEN', name: 'Benin' }]);

    expect(capitals).toHaveLength(1);
    expect(capitals[0]?.name).toBe('Cotonou');
  });

  it('drzava s vise glavnih gradova ispada iz bazena', () => {
    /*
     * Juzna Afrika ima tri ustavne prijestolnice. Dvojben odgovor u kvizu je
     * gori od nikakvog, pa se ne bira nijedna — isto nacelo po kojem se broj
     * stanovnika ne procjenjuje.
     */
    const geojson = source([
      place({ FEATURECLA: 'Admin-0 capital', NAME: 'Pretoria', ADM0_A3: 'ZAF' }, 28.2, -25.7),
      place({ FEATURECLA: 'Admin-0 capital', NAME: 'Cape Town', ADM0_A3: 'ZAF' }, 18.4, -33.9),
    ]);
    const { capitals, ambiguous } = buildCapitals(geojson, [
      { iso: 'ZAF', name: 'Južnoafrička Republika' },
    ]);

    expect(capitals).toEqual([]);
    expect(ambiguous[0]?.cities).toEqual(['Pretoria', 'Cape Town']);
  });

  it('drzava bez glavnog grada ispada i prijavljuje se', () => {
    const { capitals, withoutCapital } = buildCapitals(source([]), [
      { iso: 'ATA', name: 'Antarktika' },
    ]);

    expect(capitals).toEqual([]);
    expect(withoutCapital).toEqual(['ATA Antarktika']);
  });

  it('indeksi su gusti i prate poredak drzava', () => {
    // Indeks je meta dana; rupa u nizu pomakla bi sve mete.
    const geojson = source([
      place({ FEATURECLA: 'Admin-0 capital', NAME: 'Zagreb', ADM0_A3: 'HRV' }, 16, 45.8),
      place(
        { FEATURECLA: 'Admin-0 capital', NAME: 'Rome', NAME_EN: 'Rome', ADM0_A3: 'ITA' },
        12.5,
        41.9,
      ),
    ]);
    const { capitals } = buildCapitals(geojson, [
      { iso: 'ATA', name: 'Antarktika' },
      { iso: 'HRV', name: 'Hrvatska' },
      { iso: 'ITA', name: 'Italija' },
    ]);

    expect(capitals.map((c) => c.id)).toEqual([0, 1]);
    expect(capitals.map((c) => c.name)).toEqual(['Zagreb', 'Rim']);
  });

  it('isti ulaz daje isti izlaz', () => {
    // Nestabilan poredak pomaknuo bi mete pri svakom `pnpm data`.
    const geojson = source([
      place({ FEATURECLA: 'Admin-0 capital', NAME: 'Zagreb', ADM0_A3: 'HRV' }, 16, 45.8),
    ]);
    const countries = [{ iso: 'HRV', name: 'Hrvatska' }];
    expect(buildCapitals(geojson, countries)).toEqual(buildCapitals(geojson, countries));
  });
});

describe('generirani bazen', () => {
  const path = join(import.meta.dirname, '..', '..', 'public', 'data', 'capitals.json');
  const built = existsSync(path);

  it('postoji nakon `pnpm data`', () => {
    expect(built, 'pokreni `pnpm data` prije testa').toBe(true);
  });

  it.skipIf(!built)('dovoljno je velik da jamstvo od 30 dana vrijedi', () => {
    // Niz meta cisti prijelaz kruga tek iznad 2 * 30 mjesta. Vidi engine/seed.
    const data = JSON.parse(readFileSync(path, 'utf8')) as { n: number; capitals: Capital[] };
    expect(data.n).toBe(data.capitals.length);
    expect(data.n).toBeGreaterThan(60);
  });

  it.skipIf(!built)('svaki grad ima ime, drzavu i koordinate u rasponu', () => {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { capitals: Capital[] };
    for (const c of data.capitals) {
      expect(c.name.length, c.code).toBeGreaterThan(1);
      expect(c.country.length, c.code).toBeGreaterThan(1);
      expect(Math.abs(c.lat), c.name).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lon), c.name).toBeLessThanOrEqual(180);
    }
  });

  it.skipIf(!built)('nema duplih gradova ni duplih drzava', () => {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { capitals: Capital[] };
    expect(new Set(data.capitals.map((c) => c.code)).size).toBe(data.capitals.length);
    expect(new Set(data.capitals.map((c) => c.name)).size).toBe(data.capitals.length);
  });

  it.skipIf(!built)('poznati gradovi su ondje gdje i jesu', () => {
    // Spoj ide preko imena, pa kriva zona daje kriv grad na pravoj drzavi.
    const data = JSON.parse(readFileSync(path, 'utf8')) as { capitals: Capital[] };
    const find = (code: string): Capital | undefined => data.capitals.find((c) => c.code === code);

    expect(find('HRV')?.name).toBe('Zagreb');
    expect(find('AUT')?.name).toBe('Beč');
    expect(find('JPN')?.name).toBe('Tokio');
    expect(find('GBR')?.name).toBe('London');

    const zagreb = find('HRV');
    expect(zagreb?.lat).toBeCloseTo(45.8, 0);
    expect(zagreb?.lon).toBeCloseTo(16, 0);
  });
});
