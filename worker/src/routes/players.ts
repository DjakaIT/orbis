/** Igrači. SPEC §7.5. */

import { Hono } from 'hono';

import { player, requirePlayer, type App } from '../auth';
import { hashToken, newToken, uuid } from '../db';

const MAX_NICKNAME = 24;

export const players = new Hono<App>();

/**
 * Cijela registracija je: upiši nadimak. Bez emaila, lozinke, potvrde, OAutha.
 * Jedina ruta bez tokena. SPEC §7.2.
 */
players.post('/players', async (c) => {
  const body = await c.req.json<{ nickname?: unknown }>().catch(() => ({ nickname: undefined }));
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';

  if (!nickname) return c.json({ error: 'Nadimak je obavezan' }, 400);
  if (nickname.length > MAX_NICKNAME) return c.json({ error: 'Nadimak je predug' }, 400);

  const id = uuid();
  const token = newToken();

  await c.env.DB.prepare('INSERT INTO players (id, token_hash, nickname) VALUES (?, ?, ?)')
    .bind(id, await hashToken(token), nickname)
    .run();

  return c.json({ player_id: id, token, nickname }, 201);
});

players.get('/me', requirePlayer, async (c) => {
  const me = player(c);
  const leagues = await c.env.DB.prepare(
    `SELECT l.code, l.name FROM members m
     JOIN leagues l ON l.id = m.league_id
     WHERE m.player_id = ?
     ORDER BY m.joined_at`,
  )
    .bind(me.id)
    .all<{ code: string; name: string }>();

  return c.json({ player_id: me.id, nickname: me.nickname, leagues: leagues.results });
});
