import { describe, expect, it } from 'vitest';

import { expandTriangle } from '../../src/data/load';
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
