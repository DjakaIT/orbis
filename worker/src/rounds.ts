/** Logika runde: ljestvica, rano zatvaranje, snapshot. SPEC §7.3. */

import { compareStandings, points, type StandingRow } from '../../src/engine/scoring';
import { roundIdFor, zagrebDate, zagrebHour } from '../../src/engine/time';
import type { Env, ScoreRow } from './db';

export interface Standing extends StandingRow {
  rank: number;
}

/**
 * Ljestvica lige za rundu.
 *
 * `revealToday` je `false` dok igrač sam nije odigrao: iz tuđeg broja pokušaja
 * vidi se je li zagonetka teška. SPEC §7.6.
 */
export async function standings(
  env: Env,
  leagueId: string,
  roundId: string,
  revealToday: boolean,
  today = zagrebDate(),
): Promise<Standing[]> {
  const members = await env.DB.prepare(
    `SELECT p.id, p.nickname FROM members m
     JOIN players p ON p.id = m.player_id
     WHERE m.league_id = ?`,
  )
    .bind(leagueId)
    .all<{ id: string; nickname: string }>();

  const scores = await env.DB.prepare(
    `SELECT s.player_id, s.puzzle_date, s.mode, s.guesses, s.elapsed_ms
     FROM scores s
     JOIN members m ON m.player_id = s.player_id AND m.league_id = ?
     WHERE s.round_id = ?`,
  )
    .bind(leagueId, roundId)
    .all<ScoreRow>();

  const rows = members.results.map((m): StandingRow => {
    const own = scores.results.filter((s) => s.player_id === m.id);
    const counted = revealToday ? own : own.filter((s) => s.puzzle_date !== today);

    return {
      playerId: m.id,
      nickname: m.nickname,
      points: counted.reduce((sum, s) => sum + points(s.guesses), 0),
      guesses: counted.reduce((sum, s) => sum + s.guesses, 0),
      elapsedMs: counted.reduce((sum, s) => sum + s.elapsed_ms, 0),
      // Kvačica je jedini podatak koji ekipu tjera da zaigra, pa se pokazuje uvijek.
      playedToday: own.some((s) => s.puzzle_date === today),
    };
  });

  return rows.sort(compareStandings).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Runda u tijeku za ligu; otvara je ako ne postoji. */
export async function currentRound(env: Env, leagueId: string, now = new Date()): Promise<string> {
  const roundId = roundIdFor(now);
  await env.DB.prepare('INSERT OR IGNORE INTO rounds (league_id, round_id) VALUES (?, ?)')
    .bind(leagueId, roundId)
    .run();
  return roundId;
}

export async function isClosed(env: Env, leagueId: string, roundId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT closed_at FROM rounds WHERE league_id = ? AND round_id = ?',
  )
    .bind(leagueId, roundId)
    .first<{ closed_at: string | null }>();
  return Boolean(row?.closed_at);
}

/**
 * Jesu li svi članovi predali rezultat za posljednji dan runde?
 *
 * Posljednji dan runde je sam petak — `round_id`. SPEC §7.3.
 */
export async function everyoneDone(env: Env, leagueId: string, roundId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM members WHERE league_id = ?1) AS total,
       (SELECT COUNT(DISTINCT s.player_id) FROM scores s
          JOIN members m ON m.player_id = s.player_id AND m.league_id = ?1
          WHERE s.puzzle_date = ?2) AS done`,
  )
    .bind(leagueId, roundId)
    .first<{ total: number; done: number }>();

  if (!row || row.total === 0) return false;
  return row.done >= row.total;
}

/**
 * Zatvara rundu: snima konačnu ljestvicu i postavlja `closed_at`.
 * Zatvorena runda je nepromjenjiva — rezultati za njene dane se odbijaju s 409.
 */
export async function closeRound(env: Env, leagueId: string, roundId: string): Promise<boolean> {
  if (await isClosed(env, leagueId, roundId)) return false;

  const results = await standings(env, leagueId, roundId, true);
  const changed = await env.DB.prepare(
    `UPDATE rounds SET closed_at = datetime('now'), results = ?
     WHERE league_id = ? AND round_id = ? AND closed_at IS NULL`,
  )
    .bind(JSON.stringify(results), leagueId, roundId)
    .run();

  if (!changed.meta.changes) return false;

  // Sljedeća runda kreće odmah, da ljestvica nikad ne ostane bez otvorene runde.
  await env.DB.prepare('INSERT OR IGNORE INTO rounds (league_id, round_id) VALUES (?, ?)')
    .bind(leagueId, nextRound(roundId))
    .run();

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
  env: Env,
  leagueId: string,
  roundId: string,
): Promise<boolean> {
  if (!(await everyoneDone(env, leagueId, roundId))) return false;
  return closeRound(env, leagueId, roundId);
}

/**
 * Cron handler. Trigger je `0 * * * 5` — petkom svaki sat — a ovdje se provjerava
 * zagrebački sat.
 *
 * Satni cron s provjerom lokalnog sata je otporan na ljetno/zimsko vrijeme;
 * fiksni UTC cron ne bi bio. SPEC §7.3.
 */
export async function closeDueRounds(env: Env, now = new Date()): Promise<number> {
  if (zagrebHour(now) < 17) return 0;

  const today = zagrebDate(now);
  const due = await env.DB.prepare(
    'SELECT league_id, round_id FROM rounds WHERE closed_at IS NULL AND round_id <= ?',
  )
    .bind(today)
    .all<{ league_id: string; round_id: string }>();

  let closed = 0;
  for (const row of due.results) {
    if (await closeRound(env, row.league_id, row.round_id)) closed++;
  }
  return closed;
}
