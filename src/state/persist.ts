/**
 * Lokalno stanje u `localStorage`. SPEC §8.
 *
 * Kljuc je `orbis:v1`. Pri promjeni sheme podize se `v` i pise migracija —
 * nikad se ne brisu tudi streakovi.
 */

import { daysBetween, zagrebDate, type DateString } from '../engine/time';
import type { Mode, ModeStats, Persisted, Round } from '../types';

const KEY = 'orbis:v1';

/** Raspodjela ima osam pretinaca: 1 … 7 pokusaja i "8 i vise". */
const DIST_BUCKETS = 8;

function emptyStats(): ModeStats {
  return {
    played: 0,
    solved: 0,
    streak: 0,
    maxStreak: 0,
    dist: Array<number>(DIST_BUCKETS).fill(0),
  };
}

export function emptyState(): Persisted {
  return {
    v: 1,
    world: null,
    capitals: null,
    hr: null,
    stats: { world: emptyStats(), capitals: emptyStats(), hr: emptyStats() },
    player: null,
    lastLeagueCode: null,
    prefs: { sortBy: 'distance' },
  };
}

/**
 * Cita stanje i primjenjuje prijelaz dana.
 *
 * `localStorage` zna baciti (privatni prozor, blokirani kolacici) i zna vratiti
 * smece — oboje zavrsava praznim stanjem, nikad rusenjem igre.
 */
export function load(now: DateString = zagrebDate()): Persisted {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return emptyState();
  }
  if (!raw) return emptyState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }

  const state = migrate(parsed);
  return state ? rollOver(state, now) : emptyState();
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Puna ili nedostupna pohrana ne smije prekinuti partiju.
  }
}

/**
 * Čita pohranu **bez** prijelaza dana i upisuje izmjene.
 *
 * Igru i ligu pišu dva neovisna mjesta u isti ključ; bez read-modify-write jedno
 * bi drugome pregazilo polja svojim zastarjelim snimkom.
 */
export function patch(changes: Partial<Persisted>): Persisted {
  let current = emptyState();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) current = migrate(JSON.parse(raw)) ?? current;
  } catch {
    // Nedostupna pohrana: krece se od praznog stanja.
  }

  const next = { ...current, ...changes };
  save(next);
  return next;
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Isto.
  }
}

/** Buduce verzije sheme ulancavaju se ovdje. Nepoznat oblik je prazno stanje. */
function migrate(parsed: unknown): Persisted | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const state = parsed as Partial<Persisted>;
  if (state.v !== 1) return null;

  const base = emptyState();
  return {
    ...base,
    ...state,
    v: 1,
    /*
     * `v` ostaje 1: dodavanje moda je cisto prosirenje. Stariji zapis nema
     * `capitals` ni njegovu statistiku, pa ih dobije prazne iz `base`, a sve
     * ostalo mu ostaje. Podizanje verzije ovdje bi obrisalo tude streakove, sto
     * SPEC §8 izricito zabranjuje.
     */
    stats: {
      world: { ...base.stats.world, ...state.stats?.world },
      capitals: { ...base.stats.capitals, ...state.stats?.capitals },
      hr: { ...base.stats.hr, ...state.stats?.hr },
    },
    prefs: { ...base.prefs, ...state.prefs },
  };
}

/**
 * Nov dan: partija se resetira, ali tek nakon sto se statistika azurira.
 *
 * Streak se lomi kad prode cijeli dan bez rjesenja, ne pri samom resetu —
 * tko je rijesio jucer i otvori igru danas jos uvijek ima niz. SPEC §8.
 */
function rollOver(state: Persisted, today: DateString): Persisted {
  const next = { ...state, stats: { ...state.stats } };

  for (const mode of ['world', 'capitals', 'hr'] as const) {
    const round: Round | null = next[mode];
    if (!round || round.date === today) continue;

    const stats = { ...next.stats[mode] };

    if (!round.solved && round.guesses.length > 0) {
      // Zapoceta pa napustena partija broji se kao odigrana i lomi niz.
      stats.played += 1;
      stats.streak = 0;
    } else if (round.solved && daysBetween(round.date, today) > 1) {
      // Rijeseno, ali je izmedu prosao barem jedan cijeli dan bez rjesenja.
      stats.streak = 0;
    }

    next.stats[mode] = stats;
    next[mode] = null;
  }

  return next;
}

/** Biljezi rijesenu partiju: jedan poziv, na pogodak. */
export function recordSolved(stats: ModeStats, guesses: number): ModeStats {
  const dist = [...stats.dist];
  const bucket = Math.min(Math.max(guesses, 1), DIST_BUCKETS) - 1;
  dist[bucket] = (dist[bucket] ?? 0) + 1;

  const streak = stats.streak + 1;
  return {
    played: stats.played + 1,
    solved: stats.solved + 1,
    streak,
    maxStreak: Math.max(stats.maxStreak, streak),
    dist,
  };
}

export function statsFor(state: Persisted, mode: Mode): ModeStats {
  return state.stats[mode];
}
