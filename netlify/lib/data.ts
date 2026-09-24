/**
 * Podatkovni sloj lige nad ključ-vrijednost spremištem. SPEC §7.4.
 *
 * Prije je ovo bio SQL nad D1. Ključ-vrijednost nema JOIN, pa se veze koje je SQL
 * radio u upitu ovdje drže kao vlastiti zapisi — `code/…` i `token/…` su indeksi,
 * `member/…` i `playerLeague/…` su ista veza s dvije strane, jer se pita i „tko je
 * u ligi" i „u kojim je ligama igrač".
 *
 * Rezultati se ne drže po zapisu nego **po igraču i rundi**: jedan zapis nosi sve
 * njegove rezultate tog tjedna. Ljestvica tako košta jedno čitanje po članu, a ne
 * jedno po rezultatu.
 */

import type { Store } from './store';

export interface Player {
  id: string;
  nickname: string;
  createdAt: string;
  /**
   * Vanjski računi vezani uz ovog igrača, npr. `google`.
   *
   * Postoji da sučelje može reći „prijavljen si" i da se veza ne pokušava dvaput.
   * Sam ključ veze je zaseban zapis, jer se pita i u drugom smjeru.
   */
  linked?: string[];
}

export interface League {
  id: string;
  code: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Score {
  guesses: number;
  elapsedMs: number;
}

/** Svi rezultati jednog igrača u jednoj rundi, po ključu `datum:mod`. */
export type RoundScores = Record<string, Score>;

export interface RoundState {
  closedAt: string | null;
  /** Konacne ljestvice po modu; modovi se boduju odvojeno. */
  results: Record<string, unknown[]> | null;
}

/* ------------------------------------------------------------------ ključevi */

const key = {
  player: (id: string) => `player/${id}`,
  token: (hash: string) => `token/${hash}`,
  identity: (provider: string, subject: string) => `identity/${provider}/${subject}`,
  league: (id: string) => `league/${id}`,
  code: (code: string) => `code/${code.toUpperCase()}`,
  member: (leagueId: string, playerId: string) => `member/${leagueId}/${playerId}`,
  members: (leagueId: string) => `member/${leagueId}/`,
  playerLeague: (playerId: string, leagueId: string) => `playerLeague/${playerId}/${leagueId}`,
  playerLeagues: (playerId: string) => `playerLeague/${playerId}/`,
  scores: (playerId: string, roundId: string) => `score/${playerId}/${roundId}`,
  round: (leagueId: string, roundId: string) => `round/${leagueId}/${roundId}`,
  rounds: (leagueId: string) => `round/${leagueId}/`,
};

/** Zadnji segment ključa — id koji je `list` vratio kao dio putanje. */
function tail(k: string): string {
  return k.slice(k.lastIndexOf('/') + 1);
}

/* -------------------------------------------------------------------- igrači */

export async function createPlayer(
  store: Store,
  id: string,
  tokenHash: string,
  nickname: string,
): Promise<Player> {
  const player: Player = { id, nickname, createdAt: new Date().toISOString() };
  await store.set(key.player(id), player);
  await store.set(key.token(tokenHash), { playerId: id });
  return player;
}

export async function playerByToken(store: Store, tokenHash: string): Promise<Player | null> {
  const found = await store.get<{ playerId: string }>(key.token(tokenHash));
  return found ? store.get<Player>(key.player(found.playerId)) : null;
}

export function playerById(store: Store, id: string): Promise<Player | null> {
  return store.get<Player>(key.player(id));
}

/**
 * Još jedan token za istog igrača.
 *
 * Tokeni se ne zamjenjuju nego zbrajaju: svaki uređaj dobije svoj. Tako prijava
 * na prijenosniku ne izbaci mobitel, a jedan izgubljeni token ne nosi ostale.
 * Sprema se samo SHA-256, kao i prvi. SPEC §7.2.
 */
export async function addToken(store: Store, playerId: string, tokenHash: string): Promise<void> {
  await store.set(key.token(tokenHash), { playerId });
}

/**
 * Veže vanjski račun uz igrača.
 *
 * Zapis ide u oba smjera: `identity/…` da se iz Googleova `sub` nađe igrač, i
 * popis na samom igraču da sučelje zna da je vezan.
 */
export async function linkIdentity(
  store: Store,
  provider: string,
  subject: string,
  playerId: string,
): Promise<void> {
  await store.set(key.identity(provider, subject), {
    playerId,
    linkedAt: new Date().toISOString(),
  });

  const player = await playerById(store, playerId);
  if (!player) return;
  const linked = player.linked ?? [];
  if (!linked.includes(provider)) {
    await store.set(key.player(playerId), { ...player, linked: [...linked, provider] });
  }
}

/** Igrač vezan uz vanjski račun, ako takav postoji. */
export async function playerByIdentity(
  store: Store,
  provider: string,
  subject: string,
): Promise<Player | null> {
  const found = await store.get<{ playerId: string }>(key.identity(provider, subject));
  return found ? playerById(store, found.playerId) : null;
}

/* --------------------------------------------------------------------- lige */

export async function createLeague(
  store: Store,
  league: Omit<League, 'createdAt'>,
): Promise<League> {
  const full: League = { ...league, createdAt: new Date().toISOString() };
  await store.set(key.league(full.id), full);
  await store.set(key.code(full.code), { leagueId: full.id });
  return full;
}

export function codeTaken(store: Store, code: string): Promise<{ leagueId: string } | null> {
  return store.get<{ leagueId: string }>(key.code(code));
}

export async function leagueByCode(store: Store, code: string): Promise<League | null> {
  // Kodovi se diktiraju preko telefona, pa se prihvaćaju i mala slova.
  const found = await store.get<{ leagueId: string }>(key.code(code));
  return found ? store.get<League>(key.league(found.leagueId)) : null;
}

/* ------------------------------------------------------------------ članstvo */

export async function addMember(store: Store, leagueId: string, playerId: string): Promise<void> {
  // Ponovno pridruživanje tiho prolazi — prijatelj je već unutra.
  const joinedAt = new Date().toISOString();
  if (!(await isMember(store, leagueId, playerId))) {
    await store.set(key.member(leagueId, playerId), { joinedAt });
  }
  await store.set(key.playerLeague(playerId, leagueId), { leagueId, joinedAt });
}

export async function isMember(store: Store, leagueId: string, playerId: string): Promise<boolean> {
  return (await store.get(key.member(leagueId, playerId))) !== null;
}

export async function memberIds(store: Store, leagueId: string): Promise<string[]> {
  return (await store.list(key.members(leagueId))).map(tail);
}

/** Lige jednog igrača, poretkom pridruživanja. */
export async function leaguesOf(store: Store, playerId: string): Promise<League[]> {
  const keys = await store.list(key.playerLeagues(playerId));
  const entries = await Promise.all(
    keys.map(async (k) => ({
      link: await store.get<{ leagueId: string; joinedAt: string }>(k),
      league: await store.get<League>(key.league(tail(k))),
    })),
  );

  return entries
    .filter((e): e is { link: { leagueId: string; joinedAt: string }; league: League } =>
      Boolean(e.league && e.link),
    )
    .sort((a, b) => a.link.joinedAt.localeCompare(b.link.joinedAt))
    .map((e) => e.league);
}

export async function leagueIdsOf(store: Store, playerId: string): Promise<string[]> {
  return (await store.list(key.playerLeagues(playerId))).map(tail);
}

/* ---------------------------------------------------------------- rezultati */

export async function scoresOf(
  store: Store,
  playerId: string,
  roundId: string,
): Promise<RoundScores> {
  return (await store.get<RoundScores>(key.scores(playerId, roundId))) ?? {};
}

/**
 * Upisuje rezultat ako ga za taj dan i mod već nema.
 *
 * Ponovni pokušaj tiho pada — igrač je možda osvježio stranicu, i to ne smije
 * izgledati kao greška. SPEC §7.5. Vraća `false` kad se ništa nije promijenilo.
 */
export async function putScore(
  store: Store,
  playerId: string,
  roundId: string,
  date: string,
  mode: string,
  score: Score,
): Promise<boolean> {
  const all = await scoresOf(store, playerId, roundId);
  const field = `${date}:${mode}`;
  if (field in all) return false;

  all[field] = score;
  await store.set(key.scores(playerId, roundId), all);
  return true;
}

/** Je li igrač odigrao išta na zadani dan, u bilo kojem modu. */
export function playedOn(scores: RoundScores, date: string): boolean {
  return Object.keys(scores).some((field) => field.startsWith(`${date}:`));
}

/* -------------------------------------------------------------------- runde */

export async function roundState(
  store: Store,
  leagueId: string,
  roundId: string,
): Promise<RoundState | null> {
  return store.get<RoundState>(key.round(leagueId, roundId));
}

export async function openRound(store: Store, leagueId: string, roundId: string): Promise<void> {
  if ((await roundState(store, leagueId, roundId)) === null) {
    await store.set(key.round(leagueId, roundId), { closedAt: null, results: null });
  }
}

export async function setRound(
  store: Store,
  leagueId: string,
  roundId: string,
  state: RoundState,
): Promise<void> {
  await store.set(key.round(leagueId, roundId), state);
}

/** Zatvorene runde lige, najnovija prva. */
export async function closedRounds(
  store: Store,
  leagueId: string,
  limit = 20,
): Promise<{ roundId: string; closedAt: string; results: Record<string, unknown[]> }[]> {
  const keys = await store.list(key.rounds(leagueId));
  const states = await Promise.all(
    keys.map(async (k) => ({ roundId: tail(k), state: await store.get<RoundState>(k) })),
  );

  return states
    .filter((r): r is { roundId: string; state: RoundState & { closedAt: string } } =>
      Boolean(r.state?.closedAt),
    )
    .sort((a, b) => b.roundId.localeCompare(a.roundId))
    .slice(0, limit)
    .map((r) => ({
      roundId: r.roundId,
      closedAt: r.state.closedAt,
      results: r.state.results ?? {},
    }));
}

/** Sve otvorene runde, po svim ligama — za cron koji ih zatvara. */
export async function openRounds(store: Store): Promise<{ leagueId: string; roundId: string }[]> {
  const keys = await store.list('round/');
  const states = await Promise.all(
    keys.map(async (k) => {
      const parts = k.split('/');
      return {
        leagueId: parts[1] ?? '',
        roundId: parts[2] ?? '',
        state: await store.get<RoundState>(k),
      };
    }),
  );

  return states
    .filter((r) => r.state !== null && r.state.closedAt === null && r.leagueId && r.roundId)
    .map((r) => ({ leagueId: r.leagueId, roundId: r.roundId }));
}
