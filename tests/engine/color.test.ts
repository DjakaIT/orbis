import { describe, expect, it } from 'vitest';

import { distanceColor, distanceRgb, distanceSquare, oklchToRgb } from '../../src/engine/color';

/** Kanali iz "rgb(r, g, b)". */
function channels(css: string): [number, number, number] {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(css);
  if (!m) throw new Error(`Nije rgb(): ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Svjetlina, zasićenost i ton iz "oklch(L C H)". */
function lch(css: string): [number, number, number] {
  const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(css);
  if (!m) throw new Error(`Nije oklch(): ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe('oklchToRgb', () => {
  it('bijela je L=1, C=0', () => {
    expect(channels(oklchToRgb(1, 0, 0))).toEqual([255, 255, 255]);
  });

  it('crna je L=0', () => {
    expect(channels(oklchToRgb(0, 0, 0))).toEqual([0, 0, 0]);
  });

  it('siva bez zasicenja ima jednake kanale', () => {
    const [r, g, b] = channels(oklchToRgb(0.5, 0, 180));
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('pogada poznatu sRGB crvenu', () => {
    // #FF0000 je oklch(0.6280 0.2577 29.23).
    const [r, g, b] = channels(oklchToRgb(0.628, 0.2577, 29.23));
    expect(r).toBeGreaterThan(250);
    expect(g).toBeLessThan(10);
    expect(b).toBeLessThan(10);
  });

  it('pogada poznatu sRGB plavu', () => {
    // #0000FF je oklch(0.4520 0.3132 264.05).
    const [r, g, b] = channels(oklchToRgb(0.452, 0.3132, 264.05));
    expect(r).toBeLessThan(12);
    expect(g).toBeLessThan(12);
    expect(b).toBeGreaterThan(245);
  });

  it('boje izvan gamuta odsijeca umjesto da preliju', () => {
    const [r, g, b] = channels(oklchToRgb(0.9, 0.4, 140));
    for (const c of [r, g, b]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
    }
  });
});

describe('distanceColor', () => {
  it('pogodak vraca token, ne izracunatu boju', () => {
    expect(distanceColor(0, 'world', true)).toBe('var(--hit)');
    expect(distanceColor(0, 'hr', true)).toBe('var(--hit)');
  });

  it('nula kilometara bez pogotka nije zelena', () => {
    /*
     * Matrica nosi minimalnu udaljenost izmedu granica (SPEC §4.3), pa je svaki
     * susjed mete nula kilometara. Da nula sama znaci pogodak, cetiri susjedne
     * drzave bile bi zelene i igrac ne bi znao koja je tocna.
     */
    expect(distanceColor(0, 'world')).not.toBe('var(--hit)');
    expect(distanceColor(0, 'world')).toMatch(/^oklch\(/);
  });

  it('blizu je svjetlije i zasicenije od daleko', () => {
    const [nearL, nearC] = lch(distanceColor(500, 'world'));
    const [farL, farC] = lch(distanceColor(19000, 'world'));
    expect(nearL).toBeGreaterThan(farL);
    expect(nearC).toBeGreaterThan(farC);
  });

  it('ton ide od crvene prema indigu', () => {
    const [, , nearH] = lch(distanceColor(100, 'world'));
    const [, , farH] = lch(distanceColor(20000, 'world'));
    expect(nearH).toBeLessThan(40);
    expect(farH).toBeGreaterThan(255);
  });

  it('nijedna tocka gradijenta nije zelena kao pogodak', () => {
    /*
     * `--hit` je na tonu 152°. Kad je gradijent isao drugim smjerom, kroz taj
     * ton je prolazio na oko 10 700 km — na globusu je drzava udaljena tisucama
     * kilometara izgledala kao pogodak. Teza §2.1 je da je pogodak jedina zelena
     * na ekranu, pa ton mora zaobici cijeli zeleni raspon.
     */
    for (const mode of ['world', 'capitals', 'hr'] as const) {
      for (let step = 0; step <= 100; step++) {
        const km = (step / 100) * (mode === 'hr' ? 400 : 20000);
        const [, , h] = lch(distanceColor(km, mode));
        const distance = Math.min(Math.abs(h - 152), 360 - Math.abs(h - 152));
        expect(
          distance,
          `${mode} na ${String(Math.round(km))} km ima ton ${String(h)}`,
        ).toBeGreaterThan(60);
      }
    }
  });

  it('hrvatska skala je gusca: 300 km je ondje daleko, u svijetu blizu', () => {
    expect(distanceColor(300, 'hr')).not.toBe(distanceColor(300, 'world'));
    const [, , hrH] = lch(distanceColor(300, 'hr'));
    const [, , worldH] = lch(distanceColor(300, 'world'));
    expect(hrH).toBeGreaterThan(worldH);
  });

  it('iznad maksimuma skala je zasicena, ne prelijeva se', () => {
    expect(distanceColor(20000, 'world')).toBe(distanceColor(40000, 'world'));
    expect(distanceColor(400, 'hr')).toBe(distanceColor(9999, 'hr'));
  });

  it('negativna udaljenost ne izlazi iz skale', () => {
    expect(distanceColor(-5, 'world')).toBe(distanceColor(1e-9, 'world'));
  });
});

describe('distanceRgb', () => {
  it('canvas dobiva rgb(), nikad oklch()', () => {
    expect(distanceRgb(5000, 'world')).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(distanceRgb(0, 'world')).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  it('zapis ima zareze, jer three bez njih vraca bijelu', () => {
    /*
     * Canvas 2D prihvaca i razmake, pa je tekstura globusa bila tocna dok je
     * trag na kugli bio bijel: three parsira boju vlastitim regexom koji trazi
     * zareze i bez njih tiho vrati bijelu. Greska se vidjela samo na jednom od
     * dva korisnika iste funkcije.
     */
    expect(distanceRgb(5000, 'world')).toContain(',');
  });

  it('prati isti gradijent kao distanceColor', () => {
    const [nearR, nearG, nearB] = channels(distanceRgb(100, 'world'));
    const [farR, farG, farB] = channels(distanceRgb(19000, 'world'));
    expect(nearR).toBeGreaterThan(farR); // blizu je crveno
    expect(farB).toBeGreaterThan(nearB); // daleko je indigo
    expect(nearG).toBeGreaterThanOrEqual(0);
    expect(farG).toBeGreaterThanOrEqual(0);
  });
});

describe('distanceSquare', () => {
  it('pogodak je zeleni kvadratic', () => {
    expect(distanceSquare(0, 'world', true)).toBe('\u{1F7E9}');
  });

  it('susjed mete nije zelen, iako je nula kilometara', () => {
    expect(distanceSquare(0, 'world')).not.toBe('\u{1F7E9}');
  });

  it('zelena je samo za pogodak — ni najblizi promasaj je ne dobiva', () => {
    expect(distanceSquare(1, 'world')).not.toBe('\u{1F7E9}');
    expect(distanceSquare(1, 'hr')).not.toBe('\u{1F7E9}');
  });

  it('sto dalje, to hladnije', () => {
    expect(distanceSquare(19_999, 'world')).toBe('\u{1F7E6}');
    expect(distanceSquare(20_000, 'world')).toBe('\u{1F7E6}');
  });

  it('koristi skalu svog moda', () => {
    expect(distanceSquare(399, 'hr')).toBe('\u{1F7E6}');
    expect(distanceSquare(399, 'world')).toBe('\u{1F7E8}');
  });
});
