/** Lige i ljestvice. SPEC §7.5. */

import { Hono } from 'hono';

import { roundClosesAt, zagrebDate } from '../../../src/engine/time';
import { player, requirePlayer, type App } from '../auth';
import { leagueCode, uuid, type LeagueRow } from '../db';
import { currentRound, everyoneDone, standings } from '../rounds';

const MAX_NAME = 40;

export const leagues = new Hono<App>();

leagues.use('/leagues/*', requirePlayer);

leagues.post('/leagues', async (c) => {
  const me = player(c);
  const body = await c.req.json<{ name?: unknown }>().catch(() => ({ name: undefined }));
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!name) return c.json({ error: 'Ime lige je obavezno' }, 400);
  if (name.length > MAX_NAME) return c.json({ error: 'Ime lige je predugo' }, 400);

  const id = uuid();
  // Kod je 6 znakova iz 31-slovne abecede; sudar je malo vjerojatan, ali nije nemoguć.
  let code = leagueCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await c.env.DB.prepare('SELECT 1 FROM leagues WHERE code = ?').bind(code).first();
    if (!taken) break;
    code = leagueCode();
  }

  await c.env.DB.prepare('INSERT INTO leagues (id, code, name, owner_id) VALUES (?, ?, ?, ?)')
    .bind(id, code, name, me.id)
    .run();
  await c.env.DB.prepare('INSERT INTO members (league_id, player_id) VALUES (?, ?)')
    .bind(id, me.id)
    .run();
  await currentRound(c.env, id);

  return c.json({ league_id: id, code, name }, 201);
});

leagues.post('/leagues/:code/join', async (c) => {
  const me = player(c);
  const league = await findLeague(c.env.DB, c.req.param('code'));
  if (!league) return c.json({ error: 'Liga ne postoji' }, 404);

  // Ponovno pridruživanje tiho prolazi — prijatelj je već unutra.
  await c.env.DB.prepare('INSERT OR IGNORE INTO members (league_id, player_id) VALUES (?, ?)')
    .bind(league.id, me.id)
    .run();
  await currentRound(c.env, league.id);

  return c.json({ league_id: league.id, name: league.name });
});

leagues.get('/leagues/:code', async (c) => {
  const me = player(c);
  const league = await findLeague(c.env.DB, c.req.param('code'));
  if (!league) return c.json({ error: 'Liga ne postoji' }, 404);

  const member = await c.env.DB.prepare(
    'SELECT 1 FROM members WHERE league_id = ? AND player_id = ?',
  )
    .bind(league.id, me.id)
    .first();
  if (!member) return c.json({ error: 'Nisi član ove lige' }, 403);

  const roundId = await currentRound(c.env, league.id);
  const today = zagrebDate();

  /*
   * Tuđi današnji rezultati ostaju skriveni dok igrač sam ne odigra — inače se iz
   * broja pokušaja vidi je li zagonetka teška. SPEC §7.6.
   */
  const playedToday = await c.env.DB.prepare(
    'SELECT 1 FROM scores WHERE player_id = ? AND puzzle_date = ?',
  )
    .bind(me.id, today)
    .first();

  return c.json({
    name: league.name,
    code: league.code,
    round_id: roundId,
    closes_at: roundClosesAt(roundId),
    standings: await standings(c.env, league.id, roundId, Boolean(playedToday), today),
    everyone_done: await everyoneDone(c.env, league.id, roundId),
    revealed: Boolean(playedToday),
  });
});

leagues.get('/leagues/:code/rounds', async (c) => {
  const league = await findLeague(c.env.DB, c.req.param('code'));
  if (!league) return c.json({ error: 'Liga ne postoji' }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT round_id, closed_at, results FROM rounds
     WHERE league_id = ? AND closed_at IS NOT NULL
     ORDER BY round_id DESC LIMIT 20`,
  )
    .bind(league.id)
    .all<{ round_id: string; closed_at: string; results: string | null }>();

  return c.json({
    rounds: rows.results.map((r) => ({
      round_id: r.round_id,
      closed_at: r.closed_at,
      results: r.results ? (JSON.parse(r.results) as unknown) : [],
    })),
  });
});

function findLeague(db: D1Database, code: string): Promise<LeagueRow | null> {
  // Kodovi se diktiraju preko telefona, pa se prihvaća i mala slova.
  return db
    .prepare('SELECT id, code, name, owner_id FROM leagues WHERE code = ?')
    .bind(code.toUpperCase())
    .first<LeagueRow>();
}
