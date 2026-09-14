/**
 * Orbis liga API. Hono + D1 na Cloudflare Workersu. SPEC §7.
 *
 * Vremenska logika se **uvozi iz `src/engine/time.ts`**, ne duplicira: granice
 * runde su Europe/Zagreb i moraju biti iste na klijentu i na serveru. Isto vrijedi
 * za bodovanje iz `src/engine/scoring.ts`.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { rateLimit, type App } from './auth';
import type { Env } from './db';
import { leagues } from './routes/leagues';
import { players } from './routes/players';
import { scores } from './routes/scores';
import { closeDueRounds } from './rounds';

const DEV_ORIGIN = 'http://localhost:5173';

const app = new Hono<App>();

app.use(
  '*',
  cors({
    // Samo produkcijska domena i lokalni dev server. SPEC §7.5.
    origin: (origin, c) =>
      origin === c.env.ALLOWED_ORIGIN || origin === DEV_ORIGIN ? origin : null,
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 86_400,
  }),
);

app.use('/api/*', rateLimit);

app.route('/api', players);
app.route('/api', leagues);
app.route('/api', scores);

app.get('/api/health', (c) => c.json({ ok: true }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Greška na poslužitelju' }, 500);
});

app.notFound((c) => c.json({ error: 'Nema takve rute' }, 404));

export default {
  fetch: app.fetch,

  /**
   * Cron `0 * * * 5`: petkom svaki sat, a handler provjerava zagrebački sat.
   * Satni cron s provjerom lokalnog sata otporan je na ljetno/zimsko vrijeme;
   * fiksni UTC cron ne bi bio. SPEC §7.3.
   */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const closed = await closeDueRounds(env);
    if (closed > 0) console.warn(`Zatvoreno rundi: ${String(closed)}`);
  },
} satisfies ExportedHandler<Env>;
