import { describe, expect, it } from 'vitest';

import { expandTriangle, shapesByIso } from '../../src/data/load';
import { worldDistance } from '../../src/engine/distance';

describe('expandTriangle', () => {
  it('razvija gornji trokut u simetricnu matricu', () => {
    // Tri drzave, tri para: (0,1)=100, (0,2)=200, (1,2)=300.
    const m = expandTriangle(new Uint16Array([100, 200, 300]), 3);
    expect(Array.from(m)).toEqual([0, 100, 200, 100, 0, 300, 200, 300, 0]);
  });

  it('dijagonala ostaje nula', () => {
    const m = expandTriangle(new Uint16Array([1, 2, 3, 4, 5, 6]), 4);
    for (let i = 0; i < 4; i++) expect(m[i * 4 + i]).toBe(0);
  });

  it('simetricna je u oba smjera', () => {
    const m = expandTriangle(new Uint16Array([1, 2, 3, 4, 5, 6]), 4);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        expect(worldDistance(i, j, m, 4)).toBe(worldDistance(j, i, m, 4));
      }
    }
  });

  it('kriva duljina je greska, ne tiha nula', () => {
    expect(() => expandTriangle(new Uint16Array([1, 2]), 3)).toThrow(/ocekivano 3/);
  });

  it('jedna drzava nema parova', () => {
    expect(Array.from(expandTriangle(new Uint16Array(0), 1))).toEqual([0]);
  });
});

describe('shapesByIso', () => {
  /**
   * Australije nije bilo na globusu.
   *
   * Natural Earth daje prekomorskim teritorijima ISO njihove države, pa su tri
   * feature-a nosila `AUS`: Australija, Indian Ocean Territories i Ashmore and
   * Cartier Islands. Mapa je prepisivala ključ, pobjeđivao je zadnji u datoteci,
   * i `AUS` je na kraju bio četverokut usred Indijskog oceana. Ostatak kontinenta
   * se jednostavno nije crtao.
   *
   * Popravak je spajanje, ne biranje: teritorij **jest** kopno te države, pa
   * pogodak treba obojati i njega.
   */

  /** Kvadratni prsten sa stranicom `size`, centriran u (lon, lat). */
  function square(lon: number, lat: number, size: number): GeoJSON.Position[] {
    const h = size / 2;
    return [
      [lon - h, lat - h],
      [lon + h, lat - h],
      [lon + h, lat + h],
      [lon - h, lat + h],
      [lon - h, lat - h],
    ];
  }

  /**
   * Prava topologija, s lukovima.
   *
   * `feature()` rekonstruira koordinate **iz lukova** i ignorira `coordinates`
   * upisan na geometriju. Prva verzija ovog testa je to previdjela: svaki oblik
   * je ispao prazan, a tvrdnja „spojena su dva poligona" prošla je jer su dva
   * prazna poligona i dalje dva. Zato oblici ovdje idu kroz `arcs`.
   */
  function topologyOf(
    parts: { iso?: string; adm0?: string; ring: GeoJSON.Position[] }[],
  ): Parameters<typeof shapesByIso>[0] {
    return {
      type: 'Topology',
      arcs: parts.map((part) => part.ring),
      objects: {
        input: {
          type: 'GeometryCollection',
          geometries: parts.map((part, i) => ({
            type: 'Polygon',
            arcs: [[i]],
            properties: { ISO_A3_EH: part.iso, ADM0_A3: part.adm0 },
          })),
        },
      },
    } as unknown as Parameters<typeof shapesByIso>[0];
  }

  /** Sve točke geometrije, bez obzira je li Polygon ili MultiPolygon. */
  function points(g: GeoJSON.Geometry | undefined): GeoJSON.Position[] {
    if (g?.type === 'Polygon') return g.coordinates.flat();
    if (g?.type === 'MultiPolygon') return g.coordinates.flat(2);
    return [];
  }

  const CONTINENT = square(134, -25, 40); // Australija: lat −45 … −5
  const SPECK = square(123.6, -12.4, 0.2); // Ashmore and Cartier

  it('spaja feature-e koji dijele ISO kod umjesto da ih prepisuje', () => {
    const shapes = shapesByIso(
      topologyOf([
        { iso: 'AUS', ring: CONTINENT },
        { iso: 'AUS', ring: SPECK },
      ]),
    );

    const aus = shapes.get('AUS');
    expect(aus?.type).toBe('MultiPolygon');
    expect((aus as GeoJSON.MultiPolygon).coordinates).toHaveLength(2);
    // Oblici moraju biti stvarni, ne prazni — na tome je pao prvi pokušaj ovog testa.
    expect(points(aus).length).toBeGreaterThan(8);
  });

  it('veliki dio ne nestaje iza malog koji dolazi kasnije', () => {
    // Upravo redoslijed iz datoteke: teritorij je zapisan poslije kontinenta.
    const shapes = shapesByIso(
      topologyOf([
        { iso: 'AUS', ring: CONTINENT },
        { iso: 'AUS', ring: SPECK },
      ]),
    );

    const lats = points(shapes.get('AUS')).map((p) => p[1]!);
    // Kontinent seže do −45°; sam teritorij bi stao u pola stupnja oko −12,4°.
    expect(Math.min(...lats)).toBeLessThan(-40);
  });

  it('država bez sudara ostaje običan Polygon', () => {
    const shapes = shapesByIso(topologyOf([{ iso: 'HRV', ring: square(16, 45, 4) }]));
    expect(shapes.get('HRV')?.type).toBe('Polygon');
    expect(points(shapes.get('HRV'))).toHaveLength(5);
  });

  it('ADM0_A3 uskače kad je ISO_A3_EH -99', () => {
    // Natural Earth ima -99 i za Francusku i za Norvešku. Vidi scripts/build-data.ts.
    const shapes = shapesByIso(topologyOf([{ iso: '-99', adm0: 'FRA', ring: square(2, 47, 8) }]));
    expect(shapes.has('FRA')).toBe(true);
    expect(shapes.has('-99')).toBe(false);
  });

  it('različite države ostaju odvojene', () => {
    const shapes = shapesByIso(
      topologyOf([
        { iso: 'AUS', ring: CONTINENT },
        { iso: 'NZL', ring: square(172, -41, 6) },
      ]),
    );
    expect(shapes.size).toBe(2);
    expect(shapes.get('NZL')?.type).toBe('Polygon');
  });
});
