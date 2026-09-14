/** Autentikacija i rate limit. SPEC §7.5. */

import type { Context, MiddlewareHandler } from 'hono';

import { hashToken, type Env, type PlayerRow } from './db';

export interface Vars {
  player: PlayerRow;
}

export type App = { Bindings: Env; Variables: Vars };

/**
 * Token → SHA-256 → lookup u `players`, inače 401.
 *
 * Plaintext tokena nikad ne dolazi u bazu, pa ni curenje baze ne daje tuđi
 * identitet. SPEC §7.2.
 */
export const requirePlayer: MiddlewareHandler<App> = async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return c.json({ error: 'Nedostaje token' }, 401);

  const player = await c.env.DB.prepare('SELECT id, nickname FROM players WHERE token_hash = ?')
    .bind(await hashToken(token))
    .first<PlayerRow>();

  if (!player) return c.json({ error: 'Nepoznat token' }, 401);

  c.set('player', player);
  await next();
};

/**
 * Rate limit: 60 zahtjeva u minuti po IP-u. SPEC §7.5.
 *
 * Drži se u memoriji izolata. Za šestero prijatelja to je dovoljno — ne brani se
 * od distribuiranog napada nego od petlje u kodu koja se otrgne.
 */
const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;

const hits = new Map<string, { count: number; resetAt: number }>();

export const rateLimit: MiddlewareHandler<App> = async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  const nowMs = Date.now();

  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= nowMs) {
    hits.set(ip, { count: 1, resetAt: nowMs + WINDOW_MS });
  } else if (++entry.count > RATE_LIMIT) {
    return c.json({ error: 'Previše zahtjeva' }, 429);
  }

  // Povremeno počisti istekle zapise da mapa ne raste bez granice.
  if (hits.size > 1000) {
    for (const [key, value] of hits) if (value.resetAt <= nowMs) hits.delete(key);
  }

  await next();
};

export function player(c: Context<App>): PlayerRow {
  return c.get('player');
}
