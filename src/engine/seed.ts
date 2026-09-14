/**
 * Deterministicka dnevna meta. SPEC §5.2.
 *
 * Ista datoteka, isti datum, isti mod → isti indeks na svakom uredaju. Bez ovoga
 * dva igraca dobiju razlicite mete i liga nema smisla.
 */

import { addDays, daysBetween, type DateString } from './time';

/** Ne mijenjati nakon pustanja u rad — pomice sve buduce mete. SPEC §5.2. */
const SALT = 'orbis-v1';

/** Koliko dana unatrag meta ne smije ponoviti. */
const NO_REPEAT_DAYS = 30;

/**
 * Prvi dan niza meta. Razrjesavanje ide unaprijed od ovog datuma, pa je i on
 * nepromjenjiv kao SALT — pomak bi razbacao sve mete.
 */
const EPOCH: DateString = '2026-01-01';

export type Mode = 'world' | 'hr';

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sirovi indeks za dan, prije izbjegavanja ponavljanja. */
function baseIndex(date: DateString, mode: Mode, poolSize: number): number {
  return Math.floor(mulberry32(xmur3(`${date}:${mode}:${SALT}`)())() * poolSize);
}

/** Prvi slobodan indeks od sirovog nadalje, u krug. */
function resolve(date: DateString, mode: Mode, poolSize: number, taken: Set<number>): number {
  let i = baseIndex(date, mode, poolSize);
  // Bazen moze biti manji od prozora ponavljanja; tada petlja mora stati.
  for (let step = 0; step < poolSize && taken.has(i); step++) {
    i = (i + 1) % poolSize;
  }
  return i;
}

const cache = new Map<string, number>();

/**
 * Indeks danasnje mete u bazenu te velicine.
 *
 * Niz se razrjesava unaprijed od EPOCH-a, uz klizni prozor stvarno objavljenih
 * meta zadnjih 30 dana. Racun je cist — nista ne ovisi o lokalnoj povijesti
 * igraca — pa svi klijenti za isti dan dobiju isti indeks.
 *
 * Odstupa od koda u SPEC §5.2, koji prozor gradi od *sirovih* indeksa prethodnih
 * dana umjesto od objavljenih. Kad avoidance petlja pomakne metu, taj pomaknuti
 * indeks ne ude u prozor, pa se meta zna ponoviti i unutar deset dana — vidi
 * DECISIONS.md.
 */
export function dailyTarget(date: DateString, mode: Mode, poolSize: number): number {
  if (poolSize < 1) throw new Error('Bazen meta je prazan');

  const key = `${date}:${mode}:${String(poolSize)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const days = daysBetween(EPOCH, date);
  // Datum prije EPOCH-a nema povijest na koju bi se oslonio.
  if (days < 0) return resolve(date, mode, poolSize, new Set());

  const window: number[] = [];
  let cursor = EPOCH;
  let current = 0;
  for (let i = 0; i <= days; i++) {
    current = resolve(cursor, mode, poolSize, new Set(window));
    window.push(current);
    if (window.length > NO_REPEAT_DAYS) window.shift();
    cursor = addDays(cursor, 1);
  }

  cache.set(key, current);
  return current;
}
