import { describe, expect, it } from 'vitest';

import { cameraDistance } from '../../src/render/globe';

/**
 * Kugla mora stati cijela, na svakom obliku ekrana.
 *
 * Kamera ima vertikalni kut, pa je na uspravnom ekranu širina ono što
 * ograničava. Dok je udaljenost bila stalnih 3,2, na mobitelu je poluširina pala
 * ispod polumjera kugle i ekran joj je odsijecao lijevu i desnu stranu.
 */

const FOV = 38;

/** Vidljiva poluvisina i poluširina na udaljenosti kamere, u jedinicama scene. */
function halfExtent(aspect: number): { w: number; h: number } {
  const h = Math.tan((FOV * Math.PI) / 360) * cameraDistance(aspect);
  return { w: h * aspect, h };
}

/** Omjeri koji se stvarno pojavljuju: mobitel uspravno pa sve šire. */
const SHAPES: [string, number][] = [
  ['mobitel, usko', 360 / 520],
  ['mobitel, Pixel 7', 412 / 500],
  ['uski tablet', 768 / 620],
  ['stolno', 544 / 420],
  ['vrlo široko', 3],
];

describe('uklapanje globusa', () => {
  for (const [name, aspect] of SHAPES) {
    it(`${name}: kugla stane cijela`, () => {
      const { w, h } = halfExtent(aspect);
      // Polumjer kugle je 1; obje poluosi moraju biti barem toliko.
      expect(w, `poluširina ${w.toFixed(3)}`).toBeGreaterThanOrEqual(1);
      expect(h, `poluvisina ${h.toFixed(3)}`).toBeGreaterThanOrEqual(1);
    });
  }

  it('na uspravnom ekranu bi stalna udaljenost odsjekla strane', () => {
    /*
     * Tvrdnja o samom bugu, da se popravak ne može tiho ukloniti. Pri z = 3,2 je
     * poluvisina 1,10, pa poluširina padne ispod 1 čim je omjer uži od 0,908.
     */
    const aspect = 412 / 500;
    const fixed = Math.tan((FOV * Math.PI) / 360) * 3.2 * aspect;
    expect(fixed).toBeLessThan(1);
  });

  it('na širokom ekranu ostaje točno dosadašnjih 3,2', () => {
    // Stolni prikaz se ne smije promijeniti — mijenja se samo ono što je pucalo.
    expect(cameraDistance(1)).toBeCloseTo(3.2, 6);
    expect(cameraDistance(1.3)).toBeCloseTo(3.2, 6);
    expect(cameraDistance(3)).toBeCloseTo(3.2, 6);
  });

  it('kugla zauzima jednak udio uže osi na svakom obliku', () => {
    /*
     * Ovo je razlog zašto oreol i dalje pada na rub: CSS ga veže uz `closest-side`,
     * dakle uz polovicu kraće stranice, i računa da je rub kugle na 91 % nje.
     */
    for (const [name, aspect] of SHAPES) {
      const { w, h } = halfExtent(aspect);
      expect(1 / Math.min(w, h), name).toBeCloseTo(0.9075, 3);
    }
  });

  it('kamera se odmiče samo koliko uska os traži, ne više', () => {
    // Globus na mobitelu mora ostati skoro jednako velik, ne osjetno manji.
    const narrow = cameraDistance(412 / 500);
    expect(narrow).toBeGreaterThan(3.2);
    expect(narrow).toBeLessThan(3.2 * 1.25);
  });
});
