import { describe, expect, it } from 'vitest';

import { readZipEntry } from '../../scripts/unzip';
import { geoArea } from 'd3-geo';

import { projectionFor } from '../../src/render/mapHR';

/** Minimalan ZIP s jednim STORED članom, složen ručno. */
function storedZip(name: string, content: string): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const data = Buffer.from(content, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(0, 8); // metoda: STORED
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);

  const localBlock = Buffer.concat([local, nameBuf, data]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42); // pomak lokalnog zaglavlja

  const centralBlock = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

describe('readZipEntry', () => {
  it('čita nekomprimirani član', () => {
    expect(readZipEntry(storedZip('HR.txt', 'Zagreb\tHR'), 'HR.txt')).toBe('Zagreb\tHR');
  });

  it('nepostojeći član je greška, ne prazan niz', () => {
    expect(() => readZipEntry(storedZip('HR.txt', 'x'), 'nema.txt')).toThrow(/nema člana/);
  });

  it('datoteka koja nije ZIP je greška', () => {
    expect(() => readZipEntry(Buffer.from('ovo nije zip'), 'HR.txt')).toThrow(/End of Central/);
  });
});

/**
 * Pravokutnik oko Hrvatske, vanjski prsten **u smjeru kazaljke** — tako ga piše
 * pipeline (`-o gj2008`) i tako ga d3-geo očekuje. Vidi test niže.
 */
const OUTLINE: GeoJSON.GeometryCollection = {
  type: 'GeometryCollection',
  geometries: [
    {
      type: 'Polygon',
      coordinates: [
        [
          [13.5, 42.4],
          [13.5, 46.6],
          [19.4, 46.6],
          [19.4, 42.4],
          [13.5, 42.4],
        ],
      ],
    },
  ],
};

describe('projectionFor', () => {
  it('smješta Hrvatsku unutar canvasa, uz rub od 16 px', () => {
    const p = projectionFor(OUTLINE, 400, 600);
    for (const [lon, lat] of [
      [13.5, 42.4],
      [19.4, 46.6],
      [15.98, 45.81], // Zagreb
      [16.44, 43.51], // Split
    ] as [number, number][]) {
      const xy = p([lon, lat]);
      expect(xy).not.toBeNull();
      expect(xy?.[0]).toBeGreaterThanOrEqual(15);
      expect(xy?.[0]).toBeLessThanOrEqual(385);
      expect(xy?.[1]).toBeGreaterThanOrEqual(15);
      expect(xy?.[1]).toBeLessThanOrEqual(585);
    }
  });

  it('sjever je gore, istok je desno', () => {
    const p = projectionFor(OUTLINE, 400, 600);
    const zagreb = p([15.98, 45.81]);
    const split = p([16.44, 43.51]);
    const osijek = p([18.69, 45.55]);
    // Split je južnije od Zagreba → veći y.
    expect(split?.[1]).toBeGreaterThan(zagreb?.[1] ?? 0);
    // Osijek je istočnije od Zagreba → veći x.
    expect(osijek?.[0]).toBeGreaterThan(zagreb?.[0] ?? 0);
  });

  it('prati veličinu canvasa', () => {
    const small = projectionFor(OUTLINE, 200, 300)([16.5, 44.8]);
    const large = projectionFor(OUTLINE, 400, 600)([16.5, 44.8]);
    expect(large?.[0]).toBeGreaterThan(small?.[0] ?? 0);
  });
});

/**
 * d3-geo je stariji od RFC 7946 i očekuje vanjski prsten **u smjeru kazaljke**.
 * Poligon namotan po RFC-u tumači kao cijelu sferu bez Hrvatske, `fitExtent` se
 * sruši na mikroskopsku skalu i karta nestane u jednu točku.
 *
 * Prvi test na projekciju to nije uhvatio jer je provjeravao samo da su točke
 * *unutar* canvasa — a skupljene u središte to i jesu.
 */
describe('smjer namotavanja prstenova', () => {
  const CW = OUTLINE.geometries[0] as GeoJSON.Polygon;

  /** Isti pravokutnik, prsten obrnut — onako kako ga piše RFC 7946. */
  const ccw: GeoJSON.GeometryCollection = {
    type: 'GeometryCollection',
    geometries: [{ type: 'Polygon', coordinates: [[...CW.coordinates[0]!].reverse()] }],
  };

  it('ispravno namotan obris pokriva djelić sfere, ne cijelu', () => {
    // Hrvatska je 56 594 km² od 510 072 000 km² Zemljine površine.
    expect(geoArea(OUTLINE)).toBeLessThan(0.01);
  });

  it('obrnuto namotan obris pokriva gotovo cijelu sferu', () => {
    expect(geoArea(ccw)).toBeGreaterThan(12);
  });

  it('projekcija razvuče Hrvatsku preko canvasa, a ne u točku', () => {
    const p = projectionFor(OUTLINE, 400, 600);
    const zagreb = p([15.98, 45.81]);
    const dubrovnik = p([18.09, 42.65]);
    expect(zagreb).not.toBeNull();
    expect(dubrovnik).not.toBeNull();
    // Zagreb i Dubrovnik su na suprotnim krajevima države — moraju biti daleko.
    const spread = Math.hypot(
      (dubrovnik?.[0] ?? 0) - (zagreb?.[0] ?? 0),
      (dubrovnik?.[1] ?? 0) - (zagreb?.[1] ?? 0),
    );
    expect(spread).toBeGreaterThan(200);
  });
});
