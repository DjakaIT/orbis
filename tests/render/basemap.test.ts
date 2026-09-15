import { describe, expect, it } from 'vitest';

import { distanceField, landColor, type BaseColors } from '../../src/render/basemap';

/**
 * Model prirodne podloge.
 *
 * Podloga nije slika koju je netko skinuo nego račun iz dvije veličine: koliko
 * je piksel daleko od obale i na kojoj je širini. Ovo su tvrdnje tog računa —
 * ono što bi tiho popustilo da netko promijeni koeficijente, a globus bi i dalje
 * izgledao „nekako u redu".
 */

const C: BaseColors = {
  shelf: [5, 35, 82],
  abyss: [2, 16, 47],
  verdant: [91, 120, 73],
  arid: [145, 130, 90],
  boreal: [111, 121, 105],
  ice: [221, 230, 232],
};

/** Koliko je boja bliža suhom nego vlažnom kopnu, u [0, 1]. */
function aridness(rgb: [number, number, number]): number {
  // Crveni kanal najjasnije razdvaja zelenilo (91) od pijeska (145).
  return (rgb[0] - C.verdant[0]) / (C.arid[0] - C.verdant[0]);
}

describe('udaljenost od obale', () => {
  /** Polje 9 × 9 s kopnom u sredini 3 × 3. */
  function island(): Uint8Array {
    const m = new Uint8Array(81);
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) m[y * 9 + x] = 1;
    return m;
  }

  it('more uz obalu je bliže od mora na pučini', () => {
    const d = distanceField(island(), 9, 9, 0);
    // (2,4) dodiruje kopno; (0,4) je dva piksela dalje.
    expect(d[4 * 9 + 2]!).toBeLessThan(d[4 * 9 + 0]!);
  });

  it('kopno je nula u polju mora, i obrnuto', () => {
    const sea = distanceField(island(), 9, 9, 0);
    const land = distanceField(island(), 9, 9, 1);
    expect(sea[4 * 9 + 4]).toBe(0);
    expect(land[4 * 9 + 0]).toBe(0);
  });

  it('sredina kopna je najdalja od mora', () => {
    const d = distanceField(island(), 9, 9, 1);
    const middle = d[4 * 9 + 4]!;
    expect(middle).toBeGreaterThan(d[3 * 9 + 3]!);
  });

  it('dijagonala košta više od ravnog koraka, ali manje od dva', () => {
    // Kernel 3–4: inače bi udaljenost bila kvadratna, a obale uglate.
    const m = new Uint8Array(81);
    m[4 * 9 + 4] = 1;
    const d = distanceField(m, 9, 9, 0);
    const straight = d[4 * 9 + 6]!;
    const diagonal = d[6 * 9 + 6]!;
    expect(diagonal).toBeGreaterThan(straight);
    expect(diagonal).toBeLessThan(straight * 2);
  });
});

describe('klima kopna', () => {
  const NOISE = 0.5; // sredina šuma, da tvrdnje ne ovise o zrnu

  it('unutrašnjost na 25° je pustinja', () => {
    // Sahara, Arabija, Kalahari, australska unutrašnjost.
    expect(aridness(landColor(25, 1, NOISE, C))).toBeGreaterThan(0.55);
  });

  it('obala na istoj širini nije', () => {
    /*
     * Ovo je razlika koju sama širina ne može napraviti: Florida i jug Kine leže
     * na širini Sahare, ali uz more. Bez člana kontinentalnosti bili bi pustinja.
     */
    expect(aridness(landColor(25, 0, NOISE, C))).toBeLessThan(0.25);
  });

  it('ekvator ostaje zelen i duboko u kopnu', () => {
    // Kongo je jednako kontinentalan kao Sahara, a prašuma je.
    expect(aridness(landColor(3, 1, NOISE, C))).toBeLessThan(0.2);
  });

  it('visoke širine prelaze u tundru', () => {
    const cold = landColor(72, 0.5, NOISE, C);
    const mild = landColor(40, 0.5, NOISE, C);
    // Tundra je sivlja: plavi kanal raste prema borealnoj boji.
    expect(cold[2]).toBeGreaterThan(mild[2]);
  });

  it('nijedna boja ne izlazi iz raspona kanala', () => {
    for (const lat of [-90, -45, 0, 25, 60, 90]) {
      for (const inland of [0, 0.5, 1]) {
        for (const n of [0, 0.5, 1]) {
          for (const ch of landColor(lat, inland, n, C)) {
            expect(ch).toBeGreaterThanOrEqual(0);
            expect(ch).toBeLessThanOrEqual(255);
          }
        }
      }
    }
  });
});
