/**
 * Logika runde: ljestvica, rano zatvaranje, snapshot. SPEC §7.3.
 *
 * Prevedeno s D1 na ključ-vrijednost spremište, ali pravila su ista i računaju se
 * istim kodom iz `src/engine` — bodovanje i granice tjedna moraju biti identični
 * na klijentu i na poslužitelju.
 */

import { compareStandings, points, type StandingRow } from '../../src/engine/scoring';
import { roundIdFor, zagrebDate, zagrebHour } from '../../src/engine/time';
import {
  memberIds,
  openRound,
  openRounds,
  playedOn,
  playerById,
  roundState,
  scoresOf,
  setRound,
} from './data';
import type { Store } from './store';

export interface Standing extends StandingRow {
  rank: number;
}

/** Modovi se boduju odvojeno, pa svaki ima vlastitu ljestvicu. */
export const LEAGUE_MODES = ['world', 'capitals', 'hr'] as const;

export type LeagueMode = (typeof LEAGUE_MODES)[number];

export type StandingsByMode = Record<LeagueMode, Standing[]>;

/**
 * Ljestvica lige za rundu i **jedan mod**.
 *
 * Bodovi iz različitih modova se ne zbrajaju. Prije su se zbrajali, pa je jedan
 * redak nosio zbroj država, glavnih gradova i hrvatskih naselja — iz njega se
 * nije dalo pročitati tko je u čemu bolji, ni zašto netko vodi. Tri odvojene
 * ljestvice su tri usporediva stupca.
 *
 * `revealToday` je `false` dok igrač sam nije odigrao: iz tuđeg broja pokušaja
 * vidi se je li zagonetka teška. SPEC §7.6.
 */
export async function standings(
  store: Store,
  leagueId: string,
  roundId: string,
  revealToday: boolean,
  mode: LeagueMode,
  today = zagrebDate(),
): Promise<Standing[]> {
  const ids = await memberIds(store, leagueId);

  const rows = await Promise.all(
    ids.map(async (id): Promise<StandingRow | null> => {
      const player = await playerById(store, id);
      if (!player) return null;

      const all = await scoresOf(store, id, roundId);
      const own = Object.entries(all).filter(([field]) => field.endsWith(`:${mode}`));
      const counted = own.filter(([field]) => revealToday || !field.startsWith(`${today}:`));

      return {
        playerId: id,
        nickname: player.nickname,
        points: counted.reduce((sum, [, s]) => sum + points(s.guesses), 0),
        guesses: counted.reduce((sum, [, s]) => sum + s.guesses, 0),
        elapsedMs: counted.reduce((sum, [, s]) => sum + s.elapsedMs, 0),
        // Kvačica je jedini podatak koji ekipu tjera da zaigra, pa se pokazuje
        // uvijek — ali samo za ovaj mod, jer je i ljestvica samo za njega.
        playedToday: own.some(([field]) => field === `${today}:${mode}`),
      };
    }),
  );

  return rows
    .filter((r): r is StandingRow => r !== null)
    .sort(compareStandings)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Sve tri ljestvice odjednom. */
export async function allStandings(
  store: Store,
  leagueId: string,
  roundId: string,
  revealToday: boolean,
  today = zagrebDate(),
): Promise<StandingsByMode> {
  const tables = await Promise.all(
    LEAGUE_MODES.map((mode) => standings(store, leagueId, roundId, revealToday, mode, today)),
  );
  return Object.fromEntries(
    LEAGUE_MODES.map((mode, i) => [mode, tables[i] ?? []]),
  ) as StandingsByMode;
}

/** Runda u tijeku za ligu; otvara je ako ne postoji. */
export async function currentRound(
  store: Store,
  leagueId: string,
  now = new Date(),
): Promise<string> {
  const roundId = roundIdFor(now);
  await openRound(store, leagueId, roundId);
  return roundId;
}

export async function isClosed(store: Store, leagueId: string, roundId: string): Promise<boolean> {
  return Boolean((await roundState(store, leagueId, roundId))?.closedAt);
}

/**
 * Jesu li svi članovi predali rezultat za posljednji dan runde?
 *
 * Posljednji dan runde je sam petak — `round_id`. SPEC §7.3.
 */
export async function everyoneDone(
  store: Store,
  leagueId: string,
  roundId: string,
): Promise<boolean> {
  const ids = await memberIds(store, leagueId);
  if (ids.length === 0) return false;

  const played = await Promise.all(
    ids.map(async (id) => playedOn(await scoresOf(store, id, roundId), roundId)),
  );
  return played.every(Boolean);
}

/**
 * Zatvara rundu: snima konačnu ljestvicu i postavlja `closedAt`.
 * Zatvorena runda je nepromjenjiva — rezultati za njene dane se odbijaju s 409.
 */
export async function closeRound(
  store: Store,
  leagueId: string,
  roundId: string,
): Promise<boolean> {
  if (await isClosed(store, leagueId, roundId)) return false;

  const results = await allStandings(store, leagueId, roundId, true);
  await setRound(store, leagueId, roundId, { closedAt: new Date().toISOString(), results });

  // Sljedeća runda kreće odmah, da ljestvica nikad ne ostane bez otvorene runde.
  await openRound(store, leagueId, nextRound(roundId));
  return true;
}

function nextRound(roundId: string): string {
  const [y, m, d] = roundId.split('-').map(Number);
  const next = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 7));
  return next.toISOString().slice(0, 10);
}

/**
 * Zatvara rundu ako su svi odigrali posljednji dan. Okida se nakon svakog
 * `POST /api/scores`. SPEC §7.3.
 */
export async function closeIfEveryoneDone(
  store: Store,
  leagueId: string,
  roundId: string,
): Promise<boolean> {
  if (!(await everyoneDone(store, leagueId, roundId))) return false;
  return closeRound(store, leagueId, roundId);
}

/**
 * Zatvara sve dospjele runde. Pokreće ga zakazana funkcija.
 *
 * Trigger je petkom svaki sat, a ovdje se provjerava zagrebački sat — satni raspored
 * s provjerom lokalnog sata otporan je na ljetno/zimsko vrijeme, fiksni UTC ne bi
 * bio. SPEC §7.3.
 */
export async function closeDueRounds(store: Store, now = new Date()): Promise<number> {
  if (zagrebHour(now) < 17) return 0;

  const today = zagrebDate(now);
  let closed = 0;

  for (const { leagueId, roundId } of await openRounds(store)) {
    if (roundId <= today && (await closeRound(store, leagueId, roundId))) closed++;
  }
  return closed;
}
