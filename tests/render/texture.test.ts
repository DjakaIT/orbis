import { describe, expect, it } from 'vitest';

import { bounds, MIN_VISIBLE_PX, plan, unwrap, type Ring } from '../../src/render/texture';

/**
 * Crtanje prstenova preko ruba karte.
 *
 * Dva su slučaja i lako ih je pomiješati. Rusija i Fidži **križe** antimeridijan:
 * njima se longitude moraju odmotati, inače dobiju vodoravnu crtu preko cijele
 * karte. Antarktika ga ne križi nego **obilazi kuglu** i zatvara se po dnu karte;
 * njoj odmotavanje dodaje još jedan krug, put presiječe sam sebe, namotaji se
 * ponište i kontinent se nacrta izvrnuto — zeleni prsten oko plave sredine.
 */

/**
 * Namotaj poligona oko točke — isto pravilo koje canvas koristi za `fill()`.
 *
 * Nula znači da točka nije u ispuni. Ovo se računa ovdje jer je to jedino što
 * stvarno dokazuje da se kontinent ispunio: broj točaka i raspon longitude bili
 * su uredni i onda kad se Antarktika crtala naopako.
 */
function winding(points: [number, number][], px: number, py: number): number {
  const side = (a: [number, number], b: [number, number]): number =>
    (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]);

  let w = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    if (a[1] <= py) {
      if (b[1] > py && side(a, b) > 0) w++;
    } else if (b[1] <= py && side(a, b) < 0) w--;
  }
  return w;
}

/**
 * Antarktika u malom, s istom građom kakvu ima Natural Earth: obala oko cijele
 * kugle, pa zatvaranje preko južnog pola skokom s +180 na −180.
 */
function antarctica(coast = -70): Ring {
  const ring: Ring = [];
  for (let lon = -180; lon <= 180; lon += 10) ring.push([lon, coast]);
  ring.push([180, -90], [-180, -90], [-180, coast]);
  return ring;
}

/** Rusija u malom: uska zemlja koja prelazi antimeridijan. */
const acrossAntimeridian: Ring = [
  [170, 60],
  [-170, 60],
  [-170, 70],
  [170, 70],
  [170, 60],
];

describe('prsten koji obilazi kuglu', () => {
  it('odmotavanje mu doda cijeli jedan krug viška', () => {
    // Ovo je uzrok, izmjeren: 360° obale + još 360° od zatvaranja preko pola.
    const { min, max } = unwrap(antarctica());
    expect(max - min).toBeGreaterThan(350);
  });

  it('crta se sirovim koordinatama, u jednoj kopiji', () => {
    const { points, shifts } = plan(antarctica());
    expect(shifts).toEqual([0]);
    // Sirovo znači da skok s +180 na −180 ostaje skok — a on je donji rub karte.
    expect(Math.min(...points.map((p) => p[0]))).toBe(-180);
    expect(Math.max(...points.map((p) => p[0]))).toBe(180);
  });

  it('unutrašnjost je ispunjena, ne šuplja', () => {
    // Južno od obale, duboko u kontinentu.
    const { points } = plan(antarctica());
    expect(winding(points, 0, -80)).not.toBe(0);
    expect(winding(points, 140, -85)).not.toBe(0);
  });

  it('more sjeverno od obale ostaje prazno', () => {
    const { points } = plan(antarctica());
    expect(winding(points, 0, -60)).toBe(0);
    expect(winding(points, 0, 0)).toBe(0);
  });

  it('odmotane koordinate bi unutrašnjost ostavile praznom', () => {
    /*
     * Tvrdnja o samom bugu, da se popravak ne može tiho ukloniti: da se prsten
     * odmota, namotaji bi se poništili i canvas ne bi ispunio ništa.
     */
    const { points } = unwrap(antarctica());
    expect(winding(points, 0, -80)).toBe(0);
  });
});

describe('prsten koji križi antimeridijan', () => {
  it('odmotava se, da ne povuče crtu preko karte', () => {
    const { points } = plan(acrossAntimeridian);
    // Bez odmotavanja bi se −170 vratio preko cijele karte; ovako je 190.
    expect(points.some((p) => p[0] > 180)).toBe(true);
  });

  it('crta se i u kopiji pomaknutoj za krug, da rub ostane cijel', () => {
    const { shifts } = plan(acrossAntimeridian);
    expect(shifts).toContain(0);
    expect(shifts).toContain(-360);
  });

  it('unutrašnjost je ispunjena', () => {
    const { points } = plan(acrossAntimeridian);
    expect(winding(points, 185, 65)).not.toBe(0);
  });
});

describe('običan prsten', () => {
  const croatia: Ring = [
    [13.6, 42.4],
    [19, 42.4],
    [19, 46.5],
    [13.6, 46.5],
    [13.6, 42.4],
  ];

  it('nema kopija ni pomaka', () => {
    const { points, shifts } = plan(croatia);
    expect(shifts).toEqual([0]);
    expect(points).toHaveLength(croatia.length);
  });

  it('ispunjava se', () => {
    expect(winding(plan(croatia).points, 16, 45)).not.toBe(0);
  });
});

describe('sitne države', () => {
  /**
   * Mauricijus se bojao točno, i to se nije vidjelo.
   *
   * Prijavljeno kao „stisnuo sam Mauricijus, a karta je označila nešto drugo".
   * Izmjereno: država je promijenila 3 × 4 piksela od 2048 × 1024, na svom pravom
   * mjestu (57,3–57,7° E). Kugla se na ekranu prikazuje na oko 500 px, pa na to
   * dođe manje od jednog piksela — pokušaj se dogodio, a globus je ostao isti.
   *
   * Zato ispod praga ide i kolut. Ovdje se čuva prag: da stvarne veličine padnu
   * s prave strane, jer sam prag bez toga nije ništa.
   */

  /** Pravokutnik u stupnjevima, kao gruba zamjena za obris države. */
  function box(lon: number, lat: number, wDeg: number, hDeg: number): GeoJSON.Geometry {
    return {
      type: 'Polygon',
      coordinates: [
        [
          [lon, lat],
          [lon + wDeg, lat],
          [lon + wDeg, lat + hDeg],
          [lon, lat + hDeg],
          [lon, lat],
        ],
      ],
    };
  }

  const widthPx = (g: GeoJSON.Geometry): number => {
    const b = bounds(g);
    return Math.max(b.x1 - b.x0, b.y1 - b.y0);
  };

  it('Mauricijus je ispod praga vidljivosti', () => {
    // Oko 0,35° × 0,45° — stvarne dimenzije iz Natural Eartha.
    expect(widthPx(box(57.3, -20.5, 0.35, 0.45))).toBeLessThan(MIN_VISIBLE_PX);
  });

  it('Malta, Singapur i Maldivi također', () => {
    expect(widthPx(box(14.2, 35.8, 0.3, 0.2))).toBeLessThan(MIN_VISIBLE_PX);
    expect(widthPx(box(103.6, 1.2, 0.4, 0.2))).toBeLessThan(MIN_VISIBLE_PX);
    expect(widthPx(box(72.9, 3.2, 0.6, 1.2))).toBeLessThan(MIN_VISIBLE_PX);
  });

  it('Hrvatska je iznad njega, i ne dobiva kolut', () => {
    // Kolut preko države koja se ionako vidi bio bi šum, ne oznaka.
    expect(widthPx(box(13.5, 42.4, 5.4, 4.1))).toBeGreaterThan(MIN_VISIBLE_PX);
  });

  it('prag je iznad piksela, ali daleko ispod države', () => {
    /*
     * Prag mora ostati između dva reda veličine: veći od šuma jednog piksela,
     * manji od najmanje države koja se sama vidi. Bez toga bi ili sitne ostale
     * nevidljive ili bi kolutovi pali po pola karte.
     */
    expect(MIN_VISIBLE_PX).toBeGreaterThan(4);
    expect(MIN_VISIBLE_PX).toBeLessThan(widthPx(box(13.5, 42.4, 5.4, 4.1)));
  });
});
