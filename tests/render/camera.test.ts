import { describe, expect, it } from 'vitest';

import { cameraDistance, zoomedFov } from '../../src/render/globe';

/**
 * Kugla mora stati cijela, na svakom obliku ekrana.
 *
 * Kamera ima vertikalni kut, pa je na uspravnom ekranu širina ono što
 * ograničava. Dok je udaljenost bila stalnih 3,2, na mobitelu je poluširina pala
 * ispod polumjera kugle i ekran joj je odsijecao lijevu i desnu stranu.
 *
 *  je od 2026-09-17 jedinica: kugla ispuni kraću os do kraja. To je najveći
 * zum pri kojem se još vidi cijela — preko toga bi je uža os odsjekla.
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

  it('na širokom ekranu udaljenost ne ovisi o omjeru', () => {
    // Sirina tad nije ogranicenje, pa sva tri daju istu udaljenost.
    expect(cameraDistance(1.3)).toBeCloseTo(cameraDistance(1), 6);
    expect(cameraDistance(3)).toBeCloseTo(cameraDistance(1), 6);
  });

  it('oko kugle ostaje zraka, da je rub ne odsiječe', () => {
    /*
     * FILL = 1 je 2026-09-17 kugli oduzeo svaki piksel zraka i na stvarnim
     * ekranima se rezala sa strana: `clientWidth` je zaokruzen na cijeli piksel,
     * a oreol i sjena trebaju mjesta izvan ruba.
     */
    for (const [name, aspect] of SHAPES) {
      const { w, h } = halfExtent(aspect);
      expect(Math.min(w, h), name).toBeGreaterThan(1.05);
    }
  });

  it('kugla zauzima jednak udio uže osi na svakom obliku', () => {
    /*
     * Ovo je razlog zašto oreol i dalje pada na rub: CSS ga veže uz `closest-side`,
     * dakle uz polovicu kraće stranice, i računa da je rub kugle na 91 % nje.
     */
    for (const [name, aspect] of SHAPES) {
      const { w, h } = halfExtent(aspect);
      expect(1 / Math.min(w, h), name).toBeCloseTo(0.88, 3);
    }
  });

  it('kamera se odmiče samo koliko uska os traži, ne više', () => {
    // Globus na mobitelu mora ostati skoro jednako velik, ne osjetno manji.
    const wide = cameraDistance(3);
    const narrow = cameraDistance(412 / 500);
    expect(narrow).toBeGreaterThan(wide);
    expect(narrow).toBeLessThan(wide * 1.25);
  });
});

describe('zum', () => {
  it('jedinica je polazni kut, bez promjene', () => {
    expect(zoomedFov(1)).toBeCloseTo(FOV, 6);
  });

  it('veći zum znači uži kut', () => {
    expect(zoomedFov(2)).toBeLessThan(zoomedFov(1));
    expect(zoomedFov(4)).toBeLessThan(zoomedFov(2));
    expect(zoomedFov(4)).toBeGreaterThan(0);
  });

  it('zum je stvarno povećanje toliko puta', () => {
    /*
     * Ono što se vidi na ekranu skalira se s 1/tan(fov/2). Zum od N mora dati
     * točno N puta veći prikaz, inače brojka na kotačiću ne znači ništa.
     */
    const half = (deg: number): number => Math.tan((deg * Math.PI) / 360);
    for (const zoom of [1, 1.5, 3, 4]) {
      expect(half(FOV) / half(zoomedFov(zoom)), `zum ${String(zoom)}`).toBeCloseTo(zoom, 6);
    }
  });

  it('kamera ostaje izvan kugle na svakom zumu', () => {
    /*
     * Ovo je bug zbog kojeg zum i postoji u ovom obliku. Primicanje kamere je
     * pri zumu 8 davalo z = 0,41, a polumjer kugle je 1 — kamera je bila unutra
     * i na ekranu je ostao prazan papir.
     */
    for (const [name, aspect] of SHAPES) {
      for (const zoom of [1, 2, 3, 4]) {
        const inside = cameraDistance(aspect) / zoom;
        if (zoom > 3) expect(inside, `primicanje, ${name}`).toBeLessThan(1.2);

        // Suzavanje kuta ne dira udaljenost.
        expect(cameraDistance(aspect), `${name} @ ${String(zoom)}`).toBeGreaterThan(1);
      }
    }
  });
});
