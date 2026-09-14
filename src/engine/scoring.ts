/** Bodovi za ligu. SPEC §5.6. */

/** Indeks = broj pokušaja. Osam i više pokušaja vrijedi 1 bod. */
const TABLE = [0, 10, 8, 6, 5, 4, 3, 2];

export function points(guesses: number): number {
  if (guesses < 1) return 0;
  return TABLE[guesses] ?? 1;
}

export interface StandingRow {
  playerId: string;
  nickname: string;
  points: number;
  guesses: number;
  elapsedMs: number;
  playedToday: boolean;
}

/**
 * Razrješavanje izjednačenja, redom: više bodova, manje ukupnih pokušaja,
 * kraće ukupno vrijeme, pa abecedno po nadimku. SPEC §5.6.
 */
export function compareStandings(a: StandingRow, b: StandingRow): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.guesses !== b.guesses) return a.guesses - b.guesses;
  if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
  return a.nickname.localeCompare(b.nickname, 'hr');
}
