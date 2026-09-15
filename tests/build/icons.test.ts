import { describe, expect, it } from 'vitest';

import { INK, OCEAN, VOID, icon, og } from '../../scripts/build-icons';

import { channelDistance, decodePng } from './png';

/**
 * Ikone i OG slika iz faze 4. PNG pise vlastiti koder nad `zlib`, bez `sharp`
 * i `canvas`, pa se format mora provjeriti bajt po bajt — preglednik koji
 * odbije ikonu ne javlja zasto, samo je ne prikaze.
 *
 * `decodePng` sam pada ako potpis, duljina chunka, CRC ili filter reda ne valjaju.
 */

/** Najveca udaljenost od sredista na kojoj slika jos nije pozadina. */
function contentRadius(png: ReturnType<typeof decodePng>): number {
  const cx = png.width / 2;
  const cy = png.height / 2;
  let max = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (channelDistance(png.at(x, y), VOID) <= 2) continue;
      max = Math.max(max, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    }
  }
  return max;
}

/**
 * Obrubni prsten kako ga vidi dekoder: pojas --ink piksela na vodoravnoj osi,
 * desno od sredista. Vraca njegovu sredisnjicu i debljinu, u pikselima.
 *
 * Trazi se pojas, ne najsvjetliji piksel — prsten je unutar sebe ravan, pa bi
 * „najsvjetliji" bio bilo koji od devet jednakih i mjerio bi rub, ne sredinu.
 */
function ring(png: ReturnType<typeof decodePng>): { radius: number; width: number } {
  const cy = Math.floor(png.height / 2);
  const cx = png.width / 2;
  const xs: number[] = [];
  for (let x = Math.floor(cx); x < png.width; x++) {
    if (channelDistance(png.at(x, cy), INK) <= 20) xs.push(x + 0.5 - cx);
  }
  const first = xs[0];
  const last = xs[xs.length - 1];
  if (first === undefined || last === undefined) throw new Error('Obrub nije nadjen');
  return { radius: (first + last) / 2, width: last - first + 1 };
}

describe('PNG koder', () => {
  it('pise ispravno zaglavlje i tocno tri chunka', () => {
    const png = decodePng(icon(192, 0.06));

    expect(png.width).toBe(192);
    expect(png.height).toBe(192);
    expect(png.bitDepth).toBe(8);
    expect(png.colorType).toBe(2);
    expect(png.chunks).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('daje bajt za bajt isti izlaz pri svakom pozivu', () => {
    // Bez ovoga bi svaki `pnpm data` mijenjao ikone i time cache-busting hash.
    expect(icon(192, 0.06).equals(icon(192, 0.06))).toBe(true);
    expect(og().equals(og())).toBe(true);
  });

  it('OG slika ima tocno 1200 x 630', () => {
    const png = decodePng(og());
    expect([png.width, png.height]).toEqual([1200, 630]);
  });
});

describe('ikona', () => {
  const png = decodePng(icon(512, 0.06));
  const c = 512 / 2;
  const r = c * (1 - 0.06);

  it('pozadina je --void do samog ruba', () => {
    for (const [x, y] of [
      [0, 0],
      [511, 0],
      [0, 511],
      [511, 511],
    ] as const) {
      expect(channelDistance(png.at(x, y), VOID)).toBe(0);
    }
  });

  it('unutrasnjost diska je --ocean', () => {
    // Tocka namjerno izmaknuta od graticule: paralele su na 0 i +-0.3r,
    // meridijani na +-0.33r i +-0.68r, pa je 0.15r najdalje od svega.
    const [x, y] = [Math.round(c + 0.15 * r), Math.round(c + 0.15 * r)];
    expect(channelDistance(png.at(x, y), OCEAN)).toBeLessThanOrEqual(1);
  });

  it('obrub je --ink pojas na polumjeru diska', () => {
    const found = ring(png);
    expect(Math.abs(found.radius - r)).toBeLessThan(1);
    // Debljina je r * 0.04 = 9.6 px; pojas je +-1 px zbog antialiasinga na rubu.
    expect(found.width).toBeGreaterThanOrEqual(8);
    expect(found.width).toBeLessThanOrEqual(11);
  });

  it('graticula je vidljiva, ali tisa od obruba', () => {
    // Okomiti meridijan prolazi sredistem; mora se razlikovati od oceana.
    const onMeridian = png.at(c, Math.round(c + 0.15 * r));
    const offMeridian = png.at(Math.round(c + 0.15 * r), Math.round(c + 0.15 * r));
    expect(channelDistance(onMeridian, offMeridian)).toBeGreaterThan(10);

    // Boja je informacija: obrub nosi obris, graticula samo kontekst. SPEC §2.1.
    const edge = png.at(Math.round(c + ring(png).radius), c);
    const lum = (p: readonly number[]): number => (p[0] ?? 0) + (p[1] ?? 0) + (p[2] ?? 0);
    expect(lum(onMeridian)).toBeLessThan(lum(edge));
  });

  it('192 i 512 su ista slika u dvije velicine', () => {
    const small = decodePng(icon(192, 0.06));
    const ratio = (p: ReturnType<typeof decodePng>): number => ring(p).radius / p.width;
    expect(Math.abs(ratio(small) - ratio(png))).toBeLessThan(0.005);
  });
});

describe('maskable ikona', () => {
  it('cijeli sadrzaj stane u sigurnu zonu od 40% stranice', () => {
    // Android obrezuje maskable ikonu na krug polumjera 40% stranice. Sve izvan
    // toga se moze odsjeci — obrub globusa bi tada nestao.
    const png = decodePng(icon(512, 0.22));
    expect(contentRadius(png)).toBeLessThanOrEqual(0.4 * 512);
  });

  it('obicna ikona namjerno prelazi tu granicu', () => {
    // Da je i ona stisnuta na 78%, gubio bi se prostor na svakom launcheru koji
    // ikonu ne obrezuje. Zato postoje dvije.
    expect(contentRadius(decodePng(icon(512, 0.06)))).toBeGreaterThan(0.4 * 512);
  });
});

describe('OG slika', () => {
  const png = decodePng(og());

  it('globus je lijevo, desna polovica ostaje prazna za naslov', () => {
    // Crta se u 1200 x 630 jer to je omjer koji Facebook, Slack i iMessage
    // prikazuju bez obrezivanja; desno mjesto je za tekst koji dolazi iz meta tagova.
    expect(channelDistance(png.at(330, 315), VOID)).toBeGreaterThan(2);

    for (let x = 700; x < 1200; x += 50) {
      for (let y = 20; y < 630; y += 50) {
        expect(channelDistance(png.at(x, y), VOID)).toBe(0);
      }
    }
  });

  it('globus ne dodiruje rub', () => {
    for (let x = 0; x < 1200; x += 7) {
      expect(channelDistance(png.at(x, 0), VOID)).toBe(0);
      expect(channelDistance(png.at(x, 629), VOID)).toBe(0);
    }
  });
});
