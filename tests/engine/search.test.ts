import { describe, expect, it } from 'vitest';

import { buildIndex, match, normalize, suggest, withinOneEdit } from '../../src/engine/search';

describe('normalize', () => {
  it('Đ i đ nemaju kombinirajući dijakritik pa se rješavaju eksplicitno', () => {
    expect(normalize('Đakovo')).toBe('dakovo');
    expect(normalize('đakovo')).toBe('dakovo');
  });

  it('skida hrvatske dijakritike', () => {
    expect(normalize('Šibenik')).toBe('sibenik');
    expect(normalize('Žminj')).toBe('zminj');
    expect(normalize('Čakovec')).toBe('cakovec');
    expect(normalize('Ćićarija')).toBe('cicarija');
  });

  it('miče razmake, crtice i interpunkciju', () => {
    expect(normalize('Bosna i Hercegovina')).toBe('bosnaihercegovina');
    expect(normalize('Guinea-Bissau')).toBe('guineabissau');
    expect(normalize("Côte d'Ivoire")).toBe('cotedivoire');
  });

  it('prazan unos ostaje prazan', () => {
    expect(normalize('   ')).toBe('');
    expect(normalize('!!!')).toBe('');
  });
});

const COUNTRIES = [
  { id: 0, name: 'Hrvatska' },
  { id: 1, name: 'Srbija' },
  { id: 2, name: 'Slovenija' },
  { id: 3, name: 'Slovačka' },
  { id: 4, name: 'Njemačka' },
  { id: 5, name: 'Sjedinjene Američke Države' },
  { id: 6, name: 'Bosna i Hercegovina' },
  { id: 7, name: 'Đakovo' },
];

const ALIASES = { amerika: 'Sjedinjene Američke Države', sad: 'Sjedinjene Američke Države' };

const index = buildIndex(COUNTRIES, ALIASES);

describe('match', () => {
  it('točan pogodak', () => {
    expect(match('Hrvatska', index)).toBe(0);
    expect(match('hrvatska', index)).toBe(0);
    expect(match('  HRVATSKA  ', index)).toBe(0);
  });

  it('radi bez dijakritika', () => {
    expect(match('njemacka', index)).toBe(4);
    expect(match('djakovo', index)).toBe(null); // dj ≠ đ, za to služi aliases.json
    expect(match('dakovo', index)).toBe(7);
  });

  it('aliasi pogađaju istu državu', () => {
    expect(match('Amerika', index)).toBe(5);
    expect(match('SAD', index)).toBe(5);
  });

  it('jedinstveni prefiks od tri znaka', () => {
    expect(match('hrv', index)).toBe(0);
    expect(match('njem', index)).toBe(4);
  });

  it('dvosmislen prefiks ne pogađa', () => {
    // "slov" odgovara i Sloveniji i Slovačkoj.
    expect(match('slov', index)).toBe(null);
  });

  it('prefiks kraći od tri znaka ne razrješava', () => {
    expect(match('hr', index)).toBe(null);
  });

  it('tipfeler od jednog znaka', () => {
    expect(match('Hrvatskaa', index)).toBe(0); // umetanje
    expect(match('Hrvatsk', index)).toBe(0); // brisanje
    expect(match('Hrvatski', index)).toBe(0); // zamjena
  });

  it('tipfeler u prva dva znaka se ne prašta — ondje je kanta', () => {
    expect(match('Xrvatska', index)).toBe(null);
  });

  it('dvije greške su previše', () => {
    expect(match('Hrvtskaa', index)).toBe(null);
  });

  it('prazan unos nije pogodak', () => {
    expect(match('', index)).toBe(null);
    expect(match('   ', index)).toBe(null);
  });
});

describe('suggest', () => {
  it('prvo prefiksi, pa podnizovi', () => {
    const names = suggest('slo', index).map((e) => e.name);
    expect(names).toEqual(['Slovačka', 'Slovenija']);
  });

  it('nalazi i po sredini imena', () => {
    const names = suggest('herceg', index).map((e) => e.name);
    expect(names).toEqual(['Bosna i Hercegovina']);
  });

  it('najviše šest prijedloga', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Aland ${String(i)}` }));
    expect(suggest('aland', buildIndex(many)).length).toBe(6);
  });

  it('prazan unos ne predlaže ništa', () => {
    expect(suggest('', index)).toEqual([]);
  });
});

describe('withinOneEdit', () => {
  it('prepoznaje jednaka, umetnuta, obrisana i zamijenjena slova', () => {
    expect(withinOneEdit('abc', 'abc')).toBe(true);
    expect(withinOneEdit('abc', 'abcd')).toBe(true);
    expect(withinOneEdit('abcd', 'abc')).toBe(true);
    expect(withinOneEdit('abc', 'abd')).toBe(true);
    expect(withinOneEdit('abc', 'xbc')).toBe(true);
  });

  it('odbija dvije ili više razlika', () => {
    expect(withinOneEdit('abc', 'xyz')).toBe(false);
    expect(withinOneEdit('abc', 'abcde')).toBe(false);
    expect(withinOneEdit('abcd', 'axcy')).toBe(false);
  });
});
