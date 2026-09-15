/** Klijent API-ja lige. `fetch` je dovoljan — nema axiosa. SPEC §1. */

import type { Mode } from '../types';

import type { ClosedRound, LeagueView, Me, NewLeague, NewPlayer, ScoreResult } from './types';

/*
 * Uvijek isti origin. API je Netlifyjeva funkcija na `/api/*`, pa nema ni proxyja
 * ni CORS-a — `netlify dev` poslužuje i stranicu i funkciju na istom portu.
 *
 * Pod golim `vite dev` funkcije nema; liga tada javi da nije dostupna, a igra
 * radi normalno. `VITE_API_URL` nadjačava za slučaj da API ipak živi drugdje.
 */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

/** Greška s HTTP statusom, da pozivatelj može razlikovati 409 od 404. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Što se piše igraču kad API uopće nije ondje.
 *
 * Worker na svaki odgovor — i na greške — vraća JSON. Odgovor koji nije JSON
 * znači da zahtjev nije ni stigao do njega: proxy `/api/*` nije podešen ili
 * Worker nije deployan, pa se vraća HTML stranica hostinga. To je problem
 * postavljanja, ne igre, i tako mora i pisati — prije je ovdje stajalo doslovno
 * „HTTP 404", što igraču ne kaže ništa.
 */
export const UNREACHABLE = 'Liga trenutno nije dostupna. Igra radi i bez nje.';

interface Options {
  method?: 'GET' | 'POST';
  token?: string | null;
  body?: unknown;
}

async function call<T>(path: string, { method = 'GET', token, body }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // Mreža je pala ili je CORS odbio zahtjev; ni jedno ni drugo nije igra.
    throw new ApiError(0, UNREACHABLE);
  }

  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    // Nije JSON — do Workera se nije ni stiglo. Vidi `UNREACHABLE`.
    throw new ApiError(res.status, UNREACHABLE);
  }

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, detail?.error ?? UNREACHABLE);
  }

  return (await res.json()) as T;
}

/** Cijela registracija: upiši nadimak. SPEC §7.2. */
export function createPlayer(nickname: string): Promise<NewPlayer> {
  return call<NewPlayer>('/players', { method: 'POST', body: { nickname } });
}

export function me(token: string): Promise<Me> {
  return call<Me>('/me', { token });
}

/** Ime je neobavezno — bez njega ga poslužitelj izvede iz nadimka. */
export function createLeague(token: string, name?: string): Promise<NewLeague> {
  return call<NewLeague>('/leagues', { method: 'POST', token, body: name ? { name } : {} });
}

export function joinLeague(
  token: string,
  code: string,
): Promise<{ league_id: string; name: string }> {
  return call(`/leagues/${encodeURIComponent(code)}/join`, { method: 'POST', token });
}

export function leagueView(token: string, code: string): Promise<LeagueView> {
  return call<LeagueView>(`/leagues/${encodeURIComponent(code)}`, { token });
}

export function closedRounds(token: string, code: string): Promise<{ rounds: ClosedRound[] }> {
  return call(`/leagues/${encodeURIComponent(code)}/rounds`, { token });
}

const MIN_ELAPSED_MS = 1_000;
const MAX_ELAPSED_MS = 3_600_000;

/**
 * Predaja rezultata pri pogotku. Vrijeme se stisne u raspon koji server prima —
 * partija ostavljena preko noći inače bi ispala nevažeća. SPEC §7.5.
 */
export function submitScore(
  token: string,
  score: { puzzleDate: string; mode: Mode; guesses: number; elapsedMs: number },
): Promise<ScoreResult> {
  return call<ScoreResult>('/scores', {
    method: 'POST',
    token,
    body: {
      puzzle_date: score.puzzleDate,
      mode: score.mode,
      guesses: score.guesses,
      elapsed_ms: Math.min(Math.max(Math.round(score.elapsedMs), MIN_ELAPSED_MS), MAX_ELAPSED_MS),
    },
  });
}

/** Deep linkovi: `/l/:code` za pridruživanje, `/v/:token` za povrat. SPEC §7.2. */
export interface DeepLink {
  kind: 'join' | 'recover';
  value: string;
}

export function readDeepLink(pathname: string = globalThis.location.pathname): DeepLink | null {
  const join = /^\/l\/([A-Za-z0-9]{4,12})\/?$/.exec(pathname);
  if (join?.[1]) return { kind: 'join', value: join[1].toUpperCase() };

  const recover = /^\/v\/([a-f0-9]{64})\/?$/.exec(pathname);
  if (recover?.[1]) return { kind: 'recover', value: recover[1] };

  return null;
}

/** Miče deep link iz adresne trake da se ne pokrene drugi put pri refreshu. */
export function clearDeepLink(): void {
  globalThis.history.replaceState(null, '', '/');
}
