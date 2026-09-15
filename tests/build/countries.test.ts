import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Bazen drzava. Prijavljeno iz igre: Andora se ne moze pogoditi jer je nije bilo.
 *
 * Uzrok je bila rezolucija izvora — Natural Earth 110m je najgrublji sloj i iz
 * njega male drzave jednostavno ispadnu. Nista nije puklo ni javilo gresku; samo
 * ih nije bilo. Zato ovaj test imenuje one koje se najlakse tiho izgube.
 */

const path = join(import.meta.dirname, '..', '..', 'public', 'data', 'world-meta.json');
const built = existsSync(path);

interface Meta {
  n: number;
  countries: { id: number; iso: string; name: string; lat: number; lon: number }[];
}

const meta = built ? (JSON.parse(readFileSync(path, 'utf8')) as Meta) : null;
const has = (name: string): boolean => meta?.countries.some((c) => c.name === name) ?? false;

describe('generirani bazen drzava', () => {
  it('postoji nakon `pnpm data`', () => {
    expect(built, 'pokreni `pnpm data` prije testa').toBe(true);
  });

  it.skipIf(!built)('sadrzi mikrodrzave koje je 110m izvor izbacivao', () => {
    // Svaka od njih je nedostajala prije prelaska na 50m.
    for (const name of [
      'Andora',
      'Monako',
      'San Marino',
      'Lihtenštajn',
      'Malta',
      'Singapur',
      'Vatikan',
      'Nauru',
      'Tuvalu',
      'Palau',
      'Maldivi',
      'Barbados',
    ]) {
      expect(has(name), `nema ${name}`).toBe(true);
    }
  });

  it.skipIf(!built)('sadrzi drzave koje NE-ov `TYPE` krivo razvrstava', () => {
    /*
     * Filtar po `TYPE` bi ih izbacio: Izrael je ondje „Disputed", a Kazahstan i
     * Kuba „Sovereignty". Zato kriterij ide preko `SOVEREIGNT === ADMIN`.
     */
    for (const name of ['Izrael', 'Kazahstan', 'Kuba', 'Kosovo']) {
      expect(has(name), `nema ${name}`).toBe(true);
    }
  });

  it.skipIf(!built)('ne sadrzi teritorije — oni nisu odgovor na „koja je drzava"', () => {
    for (const name of ['Portoriko', 'Guam', 'Grenland', 'Bermudi', 'Nova Kaledonija']) {
      expect(has(name), `${name} ne bi smio biti u bazenu`).toBe(false);
    }
  });

  it.skipIf(!built)('ne sadrzi Antarktiku', () => {
    // Nema ni stanovnistvo ni glavni grad; kao dnevna meta nema smisla.
    expect(has('Antarktika')).toBe(false);
  });

  it.skipIf(!built)('svaki zapis ima jedinstven kod i koordinate u rasponu', () => {
    const countries = meta?.countries ?? [];
    expect(countries).toHaveLength(meta?.n ?? 0);
    expect(new Set(countries.map((c) => c.iso)).size).toBe(countries.length);
    expect(new Set(countries.map((c) => c.name)).size).toBe(countries.length);

    for (const c of countries) {
      expect(c.iso, c.name).toMatch(/^[A-Z]{3}$/);
      expect(Math.abs(c.lat), c.name).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lon), c.name).toBeLessThanOrEqual(180);
    }
  });

  it.skipIf(!built)('indeksi su gusti i po redu — oni su meta dana', () => {
    expect(meta?.countries.map((c) => c.id)).toEqual(
      Array.from({ length: meta?.n ?? 0 }, (_, i) => i),
    );
  });

  it.skipIf(!built)('poredak je po ISO kodu, da meta ne odluta pri svakom buildu', () => {
    const codes = meta?.countries.map((c) => c.iso) ?? [];
    expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b)));
  });

  it.skipIf(!built)('bazen je dovoljno velik da jamstvo od 30 dana vrijedi', () => {
    expect(meta?.n ?? 0).toBeGreaterThan(60);
  });
});
