/** Predaja rezultata. SPEC §7.5. */

import { Hono } from 'hono';

import { isTodayOrYesterday, roundIdFor } from '../../../src/engine/time';
import { player, requirePlayer, type App } from '../auth';
import { closeIfEveryoneDone, isClosed } from '../rounds';

/** Modovi koje liga prima. Mora pratiti CHECK ogranicenje u shemi baze. */
const MODES = ['world', 'capitals', 'hr'];

const MIN_ELAPSED_MS = 1_000;
const MAX_ELAPSED_MS = 3_600_000;

interface Body {
  puzzle_date?: unknown;
  mode?: unknown;
  guesses?: unknown;
  elapsed_ms?: unknown;
}

export const scores = new Hono<App>();

scores.post('/scores', requirePlayer, async (c) => {
  const me = player(c);
  const body = await c.req.json<Body>().catch((): Body => ({}));

  const puzzleDate = typeof body.puzzle_date === 'string' ? body.puzzle_date : '';
  const mode = MODES.includes(String(body.mode)) ? String(body.mode) : null;
  const guesses = Number(body.guesses);
  const elapsedMs = Number(body.elapsed_ms);

  if (!mode) return c.json({ error: 'Nepoznat mod' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(puzzleDate)) return c.json({ error: 'Neispravan datum' }, 400);

  // Tolerancija oko ponoći: prihvaća se današnji i jučerašnji zagrebački dan.
  if (!isTodayOrYesterday(puzzleDate)) return c.json({ error: 'Datum nije aktualan' }, 400);
  if (!Number.isInteger(guesses) || guesses < 1)
    return c.json({ error: 'Neispravan broj pokušaja' }, 400);
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_ELAPSED_MS || elapsedMs > MAX_ELAPSED_MS) {
    return c.json({ error: 'Neispravno vrijeme' }, 400);
  }

  const roundId = roundIdFor(new Date(`${puzzleDate}T12:00:00Z`));

  const memberships = await c.env.DB.prepare('SELECT league_id FROM members WHERE player_id = ?')
    .bind(me.id)
    .all<{ league_id: string }>();

  // Zatvorena runda je nepromjenjiva. SPEC §7.3.
  for (const m of memberships.results) {
    if (await isClosed(c.env, m.league_id, roundId)) {
      return c.json({ error: 'Runda je zatvorena' }, 409);
    }
  }

  /*
   * Jedan rezultat po igraču, danu i modu. Ponovni pokušaj tiho pada — igrač je
   * možda osvježio stranicu, i to ne smije izgledati kao greška. SPEC §7.5.
   */
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO scores
       (player_id, puzzle_date, mode, guesses, elapsed_ms, round_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(me.id, puzzleDate, mode, guesses, Math.round(elapsedMs), roundId)
    .run();

  let roundClosed = false;
  for (const m of memberships.results) {
    if (await closeIfEveryoneDone(c.env, m.league_id, roundId)) roundClosed = true;
  }

  return c.json({ ok: true, round_id: roundId, round_closed: roundClosed });
});
