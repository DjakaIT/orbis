import { describe, expect, it } from 'vitest';

import { flagSrc } from '../../src/engine/flag';

describe('flagSrc', () => {
  it('gradi putanju iz alpha-2 koda', () => {
    expect(flagSrc('HR')).toBe('/flags/hr.svg');
    expect(flagSrc('JP')).toBe('/flags/jp.svg');
  });

  it('ne mari za velicinu slova ni razmake', () => {
    expect(flagSrc('hr')).toBe('/flags/hr.svg');
    expect(flagSrc(' HR ')).toBe('/flags/hr.svg');
  });

  it('bez koda vraca null, a ne nadomjesnu sliku', () => {
    /*
     * Kosovo, Sj. Cipar i Somaliland nemaju valjan alpha-2 kod u izvoru.
     * Nadomjestak bi bio netocan podatak; prazno mjesto je tocno.
     */
    for (const bad of [undefined, '', '-99', 'H', 'HRV', '1A', 'h r']) {
      expect(flagSrc(bad), String(bad)).toBeNull();
    }
  });

  it('putanja je uvijek root-relativna i mala slova', () => {
    // Datoteke u `public/flags` pise pipeline malim slovima; kriv zapis bi na
    // posluzitelju osjetljivom na velika slova dao 404.
    const src = flagSrc('DE');
    expect(src).toMatch(/^\/flags\/[a-z]{2}\.svg$/);
  });
});
