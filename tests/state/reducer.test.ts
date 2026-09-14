import { beforeEach, describe, expect, it } from 'vitest';

import { emptyState } from '../../src/state/persist';
import {
  initialState,
  reducer,
  sortedGuesses,
  toRound,
  type GameState,
  type ModeData,
} from '../../src/state/reducer';
import type { Place, Round } from '../../src/types';

const PLACES: Place[] = [
  { id: 0, code: 'AAA', name: 'Prva', lat: 0, lon: 0 },
  { id: 1, code: 'BBB', name: 'Druga', lat: 10, lon: 0 },
  { id: 2, code: 'CCC', name: 'Treca', lat: 0, lon: 10 },
  { id: 3, code: 'DDD', name: 'Cetvrta', lat: -10, lon: 0 },
];

/** Simetricna matrica: (0,1)=100, (0,2)=200, (0,3)=300, (1,2)=400, (1,3)=500, (2,3)=600. */
const MATRIX = new Uint16Array([
  0, 100, 200, 300, 100, 0, 400, 500, 200, 400, 0, 600, 300, 500, 600, 0,
]);

const DATA: ModeData = { places: PLACES, matrix: MATRIX, n: 4 };
const DATE = '2026-09-14';

let state: GameState;

function load(round: Round | null = null): GameState {
  return reducer(state, { type: 'loaded', data: DATA, round, now: 1_000 });
}

beforeEach(() => {
  state = initialState(emptyState(), 'world', DATE);
});

describe('ucitavanje', () => {
  it('meta je deterministicna za dan i mod', () => {
    expect(load().target).toBe(load().target);
  });

  it('partija iz istog dana se obnavlja', () => {
    const round: Round = { date: DATE, guesses: [0, 1], solved: false, startedAt: 500 };
    const next = load(round);
    expect(next.guesses.map((g) => g.name)).toEqual(['Prva', 'Druga']);
    expect(next.startedAt).toBe(500);
  });

  it('partija iz drugog dana se odbacuje', () => {
    const round: Round = { date: '2026-09-13', guesses: [0], solved: true, startedAt: 500 };
    const next = load(round);
    expect(next.guesses).toEqual([]);
    expect(next.solved).toBe(false);
    expect(next.startedAt).toBe(1_000);
  });

  it('greska pri ucitavanju ne rusi stanje', () => {
    const next = reducer(state, { type: 'error', message: 'pukla mreza' });
    expect(next.status).toBe('error');
    expect(next.error).toBe('pukla mreza');
  });
});

describe('pokusaj', () => {
  it('udaljenost dolazi iz matrice, ne iz centroida', () => {
    const ready = { ...load(), target: 0 };
    const next = reducer(ready, { type: 'guess', id: 1, now: 2_000 });
    expect(next.guesses[0]?.km).toBe(100);
  });

  it('strelica ide preko centroida', () => {
    const ready = { ...load(), target: 1 }; // Druga je sjeverno od Prve
    const next = reducer(ready, { type: 'guess', id: 0, now: 2_000 });
    expect(next.guesses[0]?.bearing).toBeCloseTo(0, 5);
  });

  it('pogodak zatvara partiju i biljezi statistiku', () => {
    const ready = { ...load(), target: 2 };
    const next = reducer(ready, { type: 'guess', id: 2, now: 2_000 });
    expect(next.solved).toBe(true);
    expect(next.guesses[0]?.km).toBe(0);
    expect(next.stats.world.solved).toBe(1);
    expect(next.stats.world.streak).toBe(1);
    expect(next.stats.world.dist[0]).toBe(1); // rijeseno iz prvog pokusaja
  });

  it('nakon pogotka novi pokusaji ne prolaze', () => {
    const ready = { ...load(), target: 2 };
    const solved = reducer(ready, { type: 'guess', id: 2, now: 2_000 });
    const after = reducer(solved, { type: 'guess', id: 0, now: 3_000 });
    expect(after.guesses).toHaveLength(1);
  });

  it('ponovljeni unos ne trosi pokusaj', () => {
    const ready = { ...load(), target: 0 };
    const once = reducer(ready, { type: 'guess', id: 1, now: 2_000 });
    const twice = reducer(once, { type: 'guess', id: 1, now: 3_000 });
    expect(twice.guesses).toHaveLength(1);
  });

  it('redni broj pokusaja raste', () => {
    const ready = { ...load(), target: 0 };
    const a = reducer(ready, { type: 'guess', id: 1, now: 2_000 });
    const b = reducer(a, { type: 'guess', id: 2, now: 3_000 });
    expect(b.guesses.map((g) => g.ordinal)).toEqual([1, 2]);
  });

  it('neprepoznat unos ostaje zabiljezen za poruku', () => {
    const next = reducer(load(), { type: 'unknown', input: 'Xyzzy' });
    expect(next.unknown).toBe('Xyzzy');
    // Sljedeci valjani pokusaj ju brise.
    expect(reducer(next, { type: 'guess', id: 1, now: 2_000 }).unknown).toBeNull();
  });
});

describe('sortiranje', () => {
  it('default je po udaljenosti, najdalje gore', () => {
    let s: GameState = { ...load(), target: 0 };
    s = reducer(s, { type: 'guess', id: 1, now: 2_000 }); // 100 km
    s = reducer(s, { type: 'guess', id: 3, now: 3_000 }); // 300 km
    s = reducer(s, { type: 'guess', id: 2, now: 4_000 }); // 200 km
    expect(sortedGuesses(s).map((g) => g.km)).toEqual([300, 200, 100]);
  });

  it('kronoloski zadrzava redoslijed unosa', () => {
    let s: GameState = { ...load(), target: 0 };
    s = reducer(s, { type: 'guess', id: 1, now: 2_000 });
    s = reducer(s, { type: 'guess', id: 3, now: 3_000 });
    s = reducer(s, { type: 'sort', by: 'time' });
    expect(sortedGuesses(s).map((g) => g.km)).toEqual([100, 300]);
  });
});

describe('toRound', () => {
  it('zapisuje samo indekse, ne izvedene vrijednosti', () => {
    let s: GameState = { ...load(), target: 0 };
    s = reducer(s, { type: 'guess', id: 1, now: 2_000 });
    expect(toRound(s)).toEqual({ date: DATE, guesses: [1], solved: false, startedAt: 1_000 });
  });
});

describe('mod bez matrice', () => {
  it('pada na haversine preko koordinata', () => {
    const points: ModeData = { places: PLACES, matrix: null, n: 4 };
    const loaded = reducer(initialState(emptyState(), 'hr', DATE), {
      type: 'loaded',
      data: points,
      round: null,
      now: 1_000,
    });
    const next = reducer({ ...loaded, target: 0 }, { type: 'guess', id: 1, now: 2_000 });
    // 10° geografske sirine je oko 1111 km.
    expect(next.guesses[0]?.km).toBeGreaterThan(1100);
    expect(next.guesses[0]?.km).toBeLessThan(1120);
  });
});
