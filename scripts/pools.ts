/**
 * Bazeni meta i prijelaz na nove popise. Vidi `Pool` u `src/engine/seed.ts`.
 *
 * Popisi za pogađanje promijenili su se 2026-11-12 — sva hrvatska naselja,
 * Ujedinjeno Kraljevstvo kao četiri mete, bez Somalilanda, Sjevernog Cipra i
 * Zapadne Sahare, glavni gradovi iz Wikidate. Indeksi mjesta su zato drugi, ali
 * niz meta do prijelaza mora ostati **točno** onaj koji je bio u pogonu: liga je
 * usred runde, a netko je današnju metu već odigrao.
 *
 * Zato se stari popisi čuvaju u `sources/legacy-v1.json` (preuzeti s
 * produkcije) i svaki se stari indeks preslika na novi. Prvi bazen je tako stari
 * niz izražen novim indeksima, a drugi počinje na `CUTOVER`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EPOCH, dailyTarget, targetFor, type Mode, type Pool } from '../src/engine/seed';
import { addDays, zagrebDate, type DateString } from '../src/engine/time';
import { SOURCES } from './fetch-wikidata';

/**
 * Prvi dan novih popisa. Subota, prvi dan nove runde lige: runda koja je bila u
 * tijeku zatvara se u petak 2026-11-13 u 17:00 i cijela se igra starim nizom.
 */
export const CUTOVER: DateString = '2026-11-14';

export interface LegacyPoint {
  name: string;
  lat: number;
  lon: number;
}

export interface Legacy {
  world: string[];
  capitals: (LegacyPoint & { code: string })[];
  gradovi: LegacyPoint[];
  mjesta: LegacyPoint[];
}

export function readLegacy(): Legacy {
  return JSON.parse(readFileSync(join(SOURCES, 'legacy-v1.json'), 'utf8')) as Legacy;
}

/** Stari niz izražen novim indeksima, pa novi bazen od `CUTOVER`. */
export function datedPools(legacyIds: readonly number[], next: readonly number[]): Pool[] {
  return [
    { from: EPOCH, ids: legacyIds },
    { from: CUTOVER, ids: next },
  ];
}

const rad = (d: number): number => (d * Math.PI) / 180;

/** Udaljenost dviju točaka u km. Samo za spajanje starog i novog popisa. */
export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Indeks najbliže točke. */
export function nearest(
  points: readonly { lat: number; lon: number }[],
  p: { lat: number; lon: number },
): number {
  let best = -1;
  let bestKm = Infinity;
  for (const [i, q] of points.entries()) {
    const d = km(p, q);
    if (d < bestKm) {
      bestKm = d;
      best = i;
    }
  }
  return best;
}

/**
 * Provjera kontinuiteta: od danas do dana prije prijelaza novi račun mora dati
 * istu metu kao stari. `same` kaže je li novo mjesto ono staro.
 *
 * Bez ovoga bi greška u preslikavanju tiho promijenila sutrašnju metu — upravo
 * ono od čega cijeli prijelaz štiti. Pipeline pada, ne ispisuje upozorenje.
 */
export function assertContinuity(
  label: string,
  mode: Mode,
  oldSize: number,
  pools: readonly Pool[],
  same: (oldId: number, newId: number) => boolean,
  today: DateString = zagrebDate(),
): string[] {
  const lines: string[] = [];
  for (let date = today; date < CUTOVER; date = addDays(date, 1)) {
    const oldId = dailyTarget(date, mode, oldSize);
    const newId = targetFor(date, mode, pools);
    if (!same(oldId, newId)) {
      throw new Error(`${label} ${date}: stari niz daje ${String(oldId)}, novi ${String(newId)}`);
    }
    lines.push(`${label} ${date}: ${String(oldId)} → ${String(newId)}`);
  }
  return lines;
}
