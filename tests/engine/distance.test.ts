import { describe, expect, it } from 'vitest';

import { bearing, formatKm, haversine, worldDistance } from '../../src/engine/distance';

const ZAGREB = { lat: 45.815, lon: 15.982 };
const SPLIT = { lat: 43.508, lon: 16.44 };
const LONDON = { lat: 51.507, lon: -0.128 };

describe('haversine', () => {
  it('Zagreb–Split je oko 260 km', () => {
    const km = haversine(ZAGREB.lat, ZAGREB.lon, SPLIT.lat, SPLIT.lon);
    expect(km).toBeGreaterThan(250);
    expect(km).toBeLessThan(270);
  });

  it('Zagreb–London je oko 1 300 km', () => {
    const km = haversine(ZAGREB.lat, ZAGREB.lon, LONDON.lat, LONDON.lon);
    expect(km).toBeGreaterThan(1250);
    expect(km).toBeLessThan(1350);
  });

  it('ista točka je nula', () => {
    expect(haversine(ZAGREB.lat, ZAGREB.lon, ZAGREB.lat, ZAGREB.lon)).toBeCloseTo(0, 6);
  });

  it('simetričan je', () => {
    const ab = haversine(ZAGREB.lat, ZAGREB.lon, LONDON.lat, LONDON.lon);
    const ba = haversine(LONDON.lat, LONDON.lon, ZAGREB.lat, ZAGREB.lon);
    expect(ab).toBeCloseTo(ba, 9);
  });

  it('pola opsega Zemlje između polova', () => {
    expect(haversine(90, 0, -90, 0)).toBeCloseTo(Math.PI * 6371, 3);
  });
});

describe('bearing', () => {
  it('prema sjeveru je 0°', () => {
    expect(bearing(0, 0, 10, 0)).toBeCloseTo(0, 6);
  });

  it('prema istoku je 90°', () => {
    expect(bearing(0, 0, 0, 10)).toBeCloseTo(90, 6);
  });

  it('prema jugu je 180°', () => {
    expect(bearing(10, 0, 0, 0)).toBeCloseTo(180, 6);
  });

  it('prema zapadu je 270°', () => {
    expect(bearing(0, 0, 0, -10)).toBeCloseTo(270, 6);
  });

  it('London je od Zagreba prema sjeverozapadu', () => {
    const b = bearing(ZAGREB.lat, ZAGREB.lon, LONDON.lat, LONDON.lon);
    expect(b).toBeGreaterThan(280);
    expect(b).toBeLessThan(320);
  });
});

describe('worldDistance', () => {
  it('čita iz matrice po indeksu', () => {
    const n = 3;
    const m = new Uint16Array([0, 100, 200, 100, 0, 300, 200, 300, 0]);
    expect(worldDistance(0, 1, m, n)).toBe(100);
    expect(worldDistance(2, 1, m, n)).toBe(300);
    expect(worldDistance(1, 1, m, n)).toBe(0);
  });

  it('indeks izvan matrice je greška, ne undefined', () => {
    const m = new Uint16Array(4);
    expect(() => worldDistance(5, 5, m, 2)).toThrow();
  });
});

describe('formatKm', () => {
  it('razdvaja tisućice tankim razmakom, po hrvatskom pravopisu', () => {
    expect(formatKm(9412)).toBe('9\u2009412\u2009km');
    expect(formatKm(412)).toBe('412\u2009km');
    expect(formatKm(19_412)).toBe('19\u2009412\u2009km');
    expect(formatKm(0)).toBe('0\u2009km');
  });

  it('nema decimala — brojevi se čitaju kao instrument', () => {
    expect(formatKm(260.7)).toBe('261\u2009km');
  });
});
