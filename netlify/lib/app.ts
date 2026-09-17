/**
 * Orbis liga API. Hono na Netlifyjevoj funkciji, Netlify Blobs kao spremište.
 * SPEC §7.
 *
 * Vremenska logika i bodovanje se **uvoze iz `src/engine`**, ne dupliciraju:
 * granice runde su Europe/Zagreb i moraju biti iste na klijentu i na poslužitelju.
 *
 * `createApp` prima spremište, pa se cijeli API može testirati bez Netlifyja i
 * bez mreže. Prije je backend živio na Cloudflare Workeru i testirao se samo
 * protiv pokrenutog procesa — a ti su se testovi preskakali kad ga nema.
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import { isTodayOrYesterday, roundClosesAt, roundIdFor, zagrebDate } from '../../src/engine/time';
import {
  addMember,
  codeTaken,
  createLeague,
  createPlayer,
  closedRounds,
  isMember,
  leagueByCode,
  leagueIdsOf,
  leaguesOf,
  playedOn,
  playerByToken,
  putScore,
  scoresOf,
  type Player,
} from './data';
import { hashToken, leagueCode, newToken, uuid } from './ids';
import { allStandings, closeIfEveryoneDone, currentRound, everyoneDone, isClosed } from './rounds';
import type { Store } from './store';

const MAX_NICKNAME = 24;
const MAX_NAME = 40;
const MIN_ELAPSED_MS = 1_000;
const MAX_ELAPSED_MS = 3_600_000;

/** Modovi koje liga prima. */
const MODES = ['world', 'capitals', 'hr'];

/**
 * Rate limit: 60 zahtjeva u minuti po IP-u. SPEC §7.5.
 *
 * Drži se u memoriji instance. Za šestero prijatelja to je dovoljno — ne brani se
 * od distribuiranog napada nego od petlje u kodu koja se otrgne.
 */
const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;

interface ScoreBody {
  puzzle_date?: unknown;
  mode?: unknown;
  guesses?: unknown;
  elapsed_ms?: unknown;
}

interface Vars {
  player: Player;
}

interface AppEnv {
  Variables: Vars;
}

export function createApp(store: Store): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const hits = new Map<string, { count: number; resetAt: number }>();

  const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
    const ip =
      c.req.header('x-nf-client-connection-ip') ?? c.req.header('x-forwarded-for') ?? 'local';
    const nowMs = Date.now();

    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= nowMs) {
      hits.set(ip, { count: 1, resetAt: nowMs + WINDOW_MS });
    } else if (++entry.count > RATE_LIMIT) {
      return c.json({ error: 'Previše zahtjeva' }, 429);
    }

    // Povremeno počisti istekle zapise da mapa ne raste bez granice.
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (v.resetAt <= nowMs) hits.delete(k);
    }

    return next();
  };

  /**
   * Token → SHA-256 → lookup, inače 401.
   *
   * Plaintext tokena se nikad ne sprema, pa ni curenje spremišta ne daje tuđi
   * identitet. SPEC §7.2.
   */
  const requirePlayer: MiddlewareHandler<AppEnv> = async (c, next) => {
    const header = c.req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return c.json({ error: 'Nedostaje token' }, 401);

    const found = await playerByToken(store, await hashToken(token));
    if (!found) return c.json({ error: 'Nepoznat token' }, 401);

    c.set('player', found);
    return next();
  };

  app.use('/api/*', rateLimit);

  app.get('/api/health', (c) => c.json({ ok: true }));

  /* ------------------------------------------------------------------ igrači */

  /**
   * Cijela registracija je: upiši nadimak. Bez emaila, lozinke, potvrde, OAutha.
   * Jedina ruta bez tokena. SPEC §7.2.
   */
  app.post('/api/players', async (c) => {
    const body = await c.req.json<{ nickname?: unknown }>().catch(() => ({ nickname: undefined }));
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';

    if (!nickname) return c.json({ error: 'Nadimak je obavezan' }, 400);
    if (nickname.length > MAX_NICKNAME) return c.json({ error: 'Nadimak je predug' }, 400);

    const id = uuid();
    const token = newToken();
    await createPlayer(store, id, await hashToken(token), nickname);

    return c.json({ player_id: id, token, nickname }, 201);
  });

  app.get('/api/me', requirePlayer, async (c) => {
    const me = c.get('player');
    const mine = await leaguesOf(store, me.id);
    return c.json({
      player_id: me.id,
      nickname: me.nickname,
      leagues: mine.map((l) => ({ code: l.code, name: l.name })),
    });
  });

  /* -------------------------------------------------------------------- lige */

  /**
   * Otvaranje lige je jedan klik: nema obrasca, nema imena za smisliti.
   *
   * Ime je i dalje ondje jer ljestvica treba naslov, ali ga poslužitelj izvede
   * iz nadimka. Tko ga ipak posalje, dobije svoje.
   */
  app.post('/api/leagues', requirePlayer, async (c) => {
    const me = c.get('player');
    const body = await c.req.json<{ name?: unknown }>().catch(() => ({ name: undefined }));
    const given = typeof body.name === 'string' ? body.name.trim() : '';
    const name = given || `${me.nickname} i ekipa`;

    if (name.length > MAX_NAME) return c.json({ error: 'Ime lige je predugo' }, 400);

    // Kod je 6 znakova iz 31-slovne abecede; sudar je malo vjerojatan, ali nije nemoguć.
    let code = leagueCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!(await codeTaken(store, code))) break;
      code = leagueCode();
    }

    const id = uuid();
    await createLeague(store, { id, code, name, ownerId: me.id });
    await addMember(store, id, me.id);
    await currentRound(store, id);

    return c.json({ league_id: id, code, name }, 201);
  });

  app.post('/api/leagues/:code/join', requirePlayer, async (c) => {
    const me = c.get('player');
    const league = await leagueByCode(store, c.req.param('code'));
    if (!league) return c.json({ error: 'Liga ne postoji' }, 404);

    await addMember(store, league.id, me.id);
    await currentRound(store, league.id);

    return c.json({ league_id: league.id, name: league.name });
  });

  app.get('/api/leagues/:code', requirePlayer, async (c) => {
    const me = c.get('player');
    const league = await leagueByCode(store, c.req.param('code'));
    if (!league) return c.json({ error: 'Liga ne postoji' }, 404);
    if (!(await isMember(store, league.id, me.id))) {
      return c.json({ error: 'Nisi član ove lige' }, 403);
    }

    const roundId = await currentRound(store, league.id);
    const today = zagrebDate();

    /*
     * Tuđi današnji rezultati ostaju skriveni dok igrač sam ne odigra — inače se
     * iz broja pokušaja vidi je li zagonetka teška. SPEC §7.6.
     */
    const playedToday = playedOn(await scoresOf(store, me.id, roundId), today);

    return c.json({
      name: league.name,
      code: league.code,
      round_id: roundId,
      closes_at: roundClosesAt(roundId),
      standings: await allStandings(store, league.id, roundId, playedToday, today),
      everyone_done: await everyoneDone(store, league.id, roundId),
      revealed: playedToday,
    });
  });

  app.get('/api/leagues/:code/rounds', requirePlayer, async (c) => {
    const league = await leagueByCode(store, c.req.param('code'));
    if (!league) return c.json({ error: 'Liga ne postoji' }, 404);

    const rounds = await closedRounds(store, league.id);
    return c.json({
      rounds: rounds.map((r) => ({
        round_id: r.roundId,
        closed_at: r.closedAt,
        results: r.results,
      })),
    });
  });

  /* --------------------------------------------------------------- rezultati */

  app.post('/api/scores', requirePlayer, async (c) => {
    const me = c.get('player');
    const body = await c.req.json<ScoreBody>().catch((): ScoreBody => ({}));

    const puzzleDate = typeof body.puzzle_date === 'string' ? body.puzzle_date : '';
    const mode = MODES.includes(String(body.mode)) ? String(body.mode) : null;
    const guesses = Number(body.guesses);
    const elapsedMs = Number(body.elapsed_ms);

    if (!mode) return c.json({ error: 'Nepoznat mod' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(puzzleDate)) return c.json({ error: 'Neispravan datum' }, 400);

    // Tolerancija oko ponoći: prihvaća se današnji i jučerašnji zagrebački dan.
    if (!isTodayOrYesterday(puzzleDate)) return c.json({ error: 'Datum nije aktualan' }, 400);
    if (!Number.isInteger(guesses) || guesses < 1) {
      return c.json({ error: 'Neispravan broj pokušaja' }, 400);
    }
    if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_ELAPSED_MS || elapsedMs > MAX_ELAPSED_MS) {
      return c.json({ error: 'Neispravno vrijeme' }, 400);
    }

    const roundId = roundIdFor(new Date(`${puzzleDate}T12:00:00Z`));
    const leagueIds = await leagueIdsOf(store, me.id);

    // Zatvorena runda je nepromjenjiva. SPEC §7.3.
    for (const leagueId of leagueIds) {
      if (await isClosed(store, leagueId, roundId)) {
        return c.json({ error: 'Runda je zatvorena' }, 409);
      }
    }

    await putScore(store, me.id, roundId, puzzleDate, mode, {
      guesses,
      elapsedMs: Math.round(elapsedMs),
    });

    let roundClosed = false;
    for (const leagueId of leagueIds) {
      if (await closeIfEveryoneDone(store, leagueId, roundId)) roundClosed = true;
    }

    return c.json({ ok: true, round_id: roundId, round_closed: roundClosed });
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Greška na poslužitelju' }, 500);
  });

  app.notFound((c) => c.json({ error: 'Nema takve rute' }, 404));

  return app;
}
