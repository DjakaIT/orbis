import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { oklchToRgb } from '../../src/engine/color';

/**
 * Kontrast tokena iz SPEC §2.2, protiv praga 4.5:1 iz §11.3 t. 8.
 *
 * Paleta se mijenja rijetko i onda odjednom — prelazak s plavo-crne na zemljanu
 * dirnuo je svih devet boja. Bez ovoga se omjer provjerava na oko, a na oko se
 * ne vidi razlika izmedju 4.3:1 i 4.7:1.
 *
 * Citaju se stvarne vrijednosti iz tokens.css, ne kopija — kopija bi ostarila.
 */

const TOKENS = readFileSync(
  join(import.meta.dirname, '..', '..', 'src', 'styles', 'tokens.css'),
  'utf8',
);

type Rgb = [number, number, number];

/** Vrijednost tokena iz `:root`, npr. `--void`. */
function token(name: string): string {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(TOKENS)?.[1]?.trim();
  if (!value) throw new Error(`tokens.css nema ${name}`);
  return value;
}

function parse(value: string): Rgb {
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
  }

  const ok = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(value);
  if (!ok) throw new Error(`Nepoznat zapis boje: ${value}`);
  const rgb = /rgb\((\d+) (\d+) (\d+)\)/.exec(
    oklchToRgb(Number(ok[1]), Number(ok[2]), Number(ok[3])),
  );
  if (!rgb) throw new Error(`oklchToRgb nije vratio rgb(): ${value}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

/** Relativna luminancija po WCAG 2.1. */
function luminance([r, g, b]: Rgb): number {
  const channel = (x: number): number => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Omjer kontrasta dvaju tokena, 1:1 do 21:1. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(parse(token(a))), luminance(parse(token(b)))].sort(
    (x, y) => y - x,
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Omjer proizvoljne boje prema tokenu pozadine. */
function contrastWith(color: string, background: string): number {
  const [light, dark] = [luminance(parse(color)), luminance(parse(token(background)))].sort(
    (x, y) => y - x,
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe('tekst', () => {
  const cases: [string, string][] = [
    ['--ink', '--void'],
    ['--ink', '--surface'],
    ['--ink-muted', '--void'],
    ['--ink-muted', '--surface'],
    // Obje semanticke boje nose tekst: pogodak i poruku o gresci.
    ['--hit', '--void'],
    ['--error', '--void'],
  ];

  for (const [fg, bg] of cases) {
    it(`${fg} na ${bg} je barem 4.5:1`, () => {
      const ratio = contrast(fg, bg);
      expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('grafika', () => {
  it('--ink-faint ostaje ispod praga za tekst', () => {
    // Postoji zato sto je tih. Da prijedje 4.5:1, netko bi ga s pravom stavio na
    // tekst, a onda bi izgubio ulogu — razdjelnik koji se ne otima za paznju.
    expect(contrast('--ink-faint', '--void')).toBeLessThan(4.5);
  });

  it('--ink-faint svejedno zadovoljava prag za grafiku, 3:1', () => {
    // WCAG 1.4.11: rubovi i razdjelnici moraju se vidjeti.
    expect(contrast('--ink-faint', '--void')).toBeGreaterThanOrEqual(3);
  });

  it('kopno se odvaja od oceana', () => {
    // Globus je jedna tekstura; da su ova dva ista, ne bi se vidio nijedan obris.
    expect(contrast('--landmass', '--ocean')).toBeGreaterThan(1.25);
  });

  it('granice se vide na oceanu i na kopnu', () => {
    expect(contrast('--hairline', '--ocean')).toBeGreaterThan(1.8);
    expect(contrast('--hairline', '--landmass')).toBeGreaterThan(1.2);
  });
});

describe('gradijent udaljenosti', () => {
  /*
   * Gradijent je jedina zasicena boja u sucelju (SPEC §2.1) i nosi podatak, pa
   * mora ostati citljiv na pozadini. Krajevi su iz `ramp` u engine/color.ts.
   */
  it('blizu i sredina se jasno vide na pozadini', () => {
    expect(contrastWith('oklch(0.78 0.20 28)', '--void')).toBeGreaterThanOrEqual(3);
    expect(contrastWith('oklch(0.61 0.155 144)', '--void')).toBeGreaterThanOrEqual(3);
  });

  it('pogodak je svjetliji od svakog promasaja', () => {
    // Jedina zelena na ekranu mora se razaznati i po svjetlini, ne samo po tonu.
    const hit = luminance(parse(token('--hit')));
    for (const miss of ['oklch(0.78 0.20 28)', 'oklch(0.61 0.155 144)', 'oklch(0.44 0.11 260)']) {
      expect(hit).toBeGreaterThan(luminance(parse(miss)));
    }
  });
});
