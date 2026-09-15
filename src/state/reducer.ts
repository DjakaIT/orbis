/** Stanje igre. Nema Reduxa ni Zustanda — premalo stanja. SPEC §1. */

import { bearing } from '../engine/distance';
import { dailyTarget } from '../engine/seed';
import type { DateString } from '../engine/time';
import type { Guess, Mode, ModeStats, Persisted, Place, Round, Trend } from '../types';
import { recordSolved } from './persist';

export interface ModeData {
  places: Place[];
  /** Puni N*N niz udaljenosti u km, ili `null` kad se udaljenost racuna haversineom. */
  matrix: Uint16Array | null;
  n: number;
}

export interface GameState {
  mode: Mode;
  date: DateString;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  data: ModeData | null;
  /** Indeks danasnje mete u bazenu. */
  target: number | null;
  guesses: Guess[];
  solved: boolean;
  startedAt: number;
  stats: Record<Mode, ModeStats>;
  sortBy: 'distance' | 'time';
  /** Zadnji odbijeni unos, za poruku ispod polja. */
  unknown: string | null;
}

export type Action =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'loaded'; data: ModeData; round: Round | null; now: number }
  | { type: 'guess'; id: number; now: number }
  | { type: 'unknown'; input: string }
  | { type: 'sort'; by: 'distance' | 'time' };

export function initialState(persisted: Persisted, mode: Mode, date: DateString): GameState {
  return {
    mode,
    date,
    status: 'loading',
    error: null,
    data: null,
    target: null,
    guesses: [],
    solved: false,
    startedAt: 0,
    stats: persisted.stats,
    sortBy: persisted.prefs.sortBy,
    unknown: null,
  };
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'loading':
      return { ...state, status: 'loading', error: null };

    case 'error':
      return { ...state, status: 'error', error: action.message };

    case 'loaded': {
      const target = dailyTarget(state.date, state.mode, action.data.places.length);
      const restored = action.round?.date === state.date ? action.round : null;

      return {
        ...state,
        status: 'ready',
        data: action.data,
        target,
        guesses: describeAll(restored?.guesses ?? [], target, action.data),
        solved: restored?.solved ?? false,
        startedAt: restored?.startedAt ?? action.now,
      };
    }

    case 'guess': {
      if (state.solved || state.target === null || !state.data) return state;
      // Ponovljeni unos iste mete ne trosi pokusaj.
      if (state.guesses.some((g) => g.id === action.id)) return { ...state, unknown: null };

      const previous = state.guesses[state.guesses.length - 1];
      const guess = describe(
        action.id,
        state.target,
        state.data,
        state.guesses.length + 1,
        previous?.km ?? null,
      );
      const guesses = [...state.guesses, guess];
      const solved = action.id === state.target;

      return {
        ...state,
        guesses,
        solved,
        unknown: null,
        stats: solved
          ? { ...state.stats, [state.mode]: recordSolved(state.stats[state.mode], guesses.length) }
          : state.stats,
      };
    }

    case 'unknown':
      return { ...state, unknown: action.input };

    case 'sort':
      return { ...state, sortBy: action.by };
  }
}

/** Cijela partija odjednom — trend svakog pokusaja gleda prethodni. */
function describeAll(ids: number[], target: number, data: ModeData): Guess[] {
  const out: Guess[] = [];
  for (const [i, id] of ids.entries()) {
    out.push(describe(id, target, data, i + 1, out[i - 1]?.km ?? null));
  }
  return out;
}

/** Udaljenost, smjer i odnos prema prethodnom pokusaju. */
function describe(
  id: number,
  target: number,
  data: ModeData,
  ordinal: number,
  previousKm: number | null,
): Guess {
  const from = data.places[id];
  const to = data.places[target];
  if (!from || !to) throw new Error(`Meta ${String(id)} nije u bazenu`);

  const km = data.matrix ? (data.matrix[id * data.n + target] ?? 0) : haversineKm(from, to);
  const hit = id === target;

  return {
    id,
    name: from.name,
    km,
    // Strelica uvijek ide preko centroida; udaljenost nikad. SPEC §4.3.
    bearing: bearing(from.lat, from.lon, to.lat, to.lon),
    ordinal,
    hit,
    /*
     * Nula kilometara znaci da se granice diraju — matrica nosi minimalnu
     * udaljenost izmedu granica (SPEC §4.3). Susjed nije pogodak i ne smije se
     * tako prikazati. U modu Hrvatska naselja su tocke pa susjedstva nema.
     */
    neighbour: !hit && km === 0 && data.matrix !== null,
    trend: trendOf(km, previousKm),
  };
}

function trendOf(km: number, previousKm: number | null): Trend {
  if (previousKm === null) return 'first';
  if (km < previousKm) return 'closer';
  if (km > previousKm) return 'farther';
  return 'same';
}

function haversineKm(a: Place, b: Place): number {
  // Naselja su tocke pa matrica nije potrebna — haversine je trivijalan. SPEC §4.4.
  const R = 6371;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/** Redci za prikaz: po udaljenosti (najdalje gore) ili kronoloski. SPEC §2.4. */
export function sortedGuesses(state: GameState): Guess[] {
  const rows = [...state.guesses];
  if (state.sortBy === 'time') return rows;
  return rows.sort((a, b) => b.km - a.km);
}

/** Stanje partije za zapis u localStorage. */
export function toRound(state: GameState): Round {
  return {
    date: state.date,
    guesses: state.guesses.map((g) => g.id),
    solved: state.solved,
    startedAt: state.startedAt,
  };
}
