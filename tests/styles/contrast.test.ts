import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { distanceColor, distanceRgb, oklchToRgb } from '../../src/engine/color';

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

/** Vrijednost tokena iz `:root`, npr. `--paper`. */
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

  // `distanceRgb` vraca rgb() jer canvas ne prima oklch pouzdano.
  const plain = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(value);
  if (plain) return [Number(plain[1]), Number(plain[2]), Number(plain[3])];

  const ok = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(value);
  if (!ok) throw new Error(`Nepoznat zapis boje: ${value}`);
  const rgb = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(
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

/** 21 tocka po skali: krajevi i devetnaest koraka izmedu njih. */
const steps = Array.from({ length: 21 }, (_, i) => i / 20);

describe('tekst', () => {
  const cases: [string, string][] = [
    ['--ink', '--paper'],
    ['--ink', '--surface'],
    ['--ink-muted', '--paper'],
    ['--ink-muted', '--surface'],
    // Obje semanticke boje nose tekst: pogodak i poruku o gresci.
    ['--hit', '--paper'],
    ['--error', '--paper'],
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
    expect(contrast('--ink-faint', '--paper')).toBeLessThan(4.5);
  });

  it('--ink-faint svejedno zadovoljava prag za grafiku, 3:1', () => {
    // WCAG 1.4.11: rubovi i razdjelnici moraju se vidjeti.
    expect(contrast('--ink-faint', '--paper')).toBeGreaterThanOrEqual(3);
  });

  it('kopno se odvaja od oceana', () => {
    /*
     * Prag je bio 1,25 i prolazio je dok se na ekranu vidjela crna lopta: ocean
     * #06171F i kopno #2B3A26 dali su 1,26:1. Formalno „vidi se", stvarno ne.
     * Sada vrijedi isti prag koji WCAG 1.4.11 trazi za graficke elemente — 3:1 —
     * jer obris kontinenta jest graficki element, i to najvazniji na kugli.
     */
    expect(contrast('--landmass', '--ocean')).toBeGreaterThanOrEqual(3);
  });

  it('kopno je svjetlije od mora, kao na fotografiji planeta', () => {
    // Obrnuto bi bilo citljivo jednako, ali ne bi izgledalo kao Zemlja.
    expect(luminance(parse(token('--landmass')))).toBeGreaterThan(
      luminance(parse(token('--ocean'))),
    );
  });

  it('pogodak se izdvaja od kopna na koje se boja', () => {
    /*
     * Meta se boja usred drugog kopna, pa se mora vidjeti i prije nego se globus
     * okrene i prije nego se otvori kartica. Ovo je prag koji je paletu odlucio:
     * prva rucno odabrana kombinacija davala je 2,77:1, ispod WCAG 1.4.11.
     */
    expect(contrast('--hit-stage', '--landmass')).toBeGreaterThanOrEqual(3);
  });

  it('pogodak je najsvjetlija stvar na kugli', () => {
    /*
     * SPEC §2.1: „kad pogodi metu i ona zasvijetli zeleno, to je najsvjetlija
     * stvar koju je vidio otkad je otvorio stranicu." Gradijent je jedina druga
     * zasicena boja ondje, pa je dovoljno nadmasiti njegov najsvjetliji korak.
     */
    const hit = luminance(parse(token('--hit-stage')));
    for (const mode of ['world', 'capitals', 'hr'] as const) {
      for (const t of steps) {
        const km = t * (mode === 'hr' ? 400 : 20000);
        expect(
          luminance(parse(distanceRgb(km, mode))),
          `${mode} ${String(Math.round(km))} km`,
        ).toBeLessThan(hit);
      }
    }
  });

  it('pogodak se vidi i na moru, za otocne drzave', () => {
    expect(contrast('--hit-stage', '--ocean')).toBeGreaterThanOrEqual(3);
  });

  it('more je stvarno plavo, ne tek tamno', () => {
    /*
     * Ovo cuva namjeru koju omjeri ne mogu izraziti. Plavi kanal nosi tek 7,2 %
     * luminancije, pa se smije gurnuti visoko a da boja ostane dovoljno tamna za
     * gradijent — ali upravo zato ga je lako i zaboraviti.
     */
    const [r, g, b] = parse(token('--ocean'));
    expect(b).toBeGreaterThan(Math.max(r, g) * 2);
  });

  it('granice se vide na oceanu i na kopnu', () => {
    expect(contrast('--hairline', '--ocean')).toBeGreaterThan(1.8);
    expect(contrast('--hairline', '--landmass')).toBeGreaterThan(1.2);
  });
});

describe('gradijent udaljenosti', () => {
  /*
   * Gradijent je jedina zasicena boja u sucelju (SPEC §2.1) i nosi podatak, pa
   * mora ostati citljiv na svojoj podlozi. Vrijednosti se ne prepisuju ovdje nego
   * se traze od samih funkcija — prepisana kopija bi ostarila cim se skala makne.
   *
   * Dvije podloge, dvije skale: sucelje je na papiru, scena globusa je tamna.
   * WCAG 1.4.11 trazi 3:1 za graficke elemente.
   */
  it('traka u sucelju se vidi na papiru po cijeloj skali', () => {
    for (const mode of ['world', 'capitals', 'hr'] as const) {
      for (const t of steps) {
        const km = t * (mode === 'hr' ? 400 : 20000);
        const ratio = contrastWith(distanceColor(km, mode), '--paper');
        expect(
          ratio,
          `${mode} na ${String(Math.round(km))} km: ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('boja na globusu se vidi na oceanu po cijeloj skali', () => {
    for (const mode of ['world', 'capitals', 'hr'] as const) {
      for (const t of steps) {
        const km = t * (mode === 'hr' ? 400 : 20000);
        const ratio = contrastWith(distanceRgb(km, mode), '--ocean');
        expect(
          ratio,
          `${mode} na ${String(Math.round(km))} km: ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('pogodak se na papiru razaznaje od svakog promasaja', () => {
    /*
     * Na tamnoj sceni pogodak se izdvajao svjetlinom. Na papiru je obrnuto —
     * zelena mora biti tamna da nosi tekst — pa razliku nosi ton: gradijent je
     * cijelom duljinom barem 60° od tona pogotka. To cuva tests/engine/color.
     * Ovdje se provjerava ono sto je ovdje mjerljivo: da se vidi na papiru.
     */
    expect(contrast('--hit', '--paper')).toBeGreaterThanOrEqual(4.5);

    const hit = luminance(parse(token('--hit')));
    const nearest = luminance(parse(distanceColor(0, 'world')));
    expect(Math.abs(hit - nearest)).toBeGreaterThan(0.02);
  });
});
