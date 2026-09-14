/** Tipovi i pomoćnici oko D1. SPEC §7.4. */

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
}

export interface PlayerRow {
  id: string;
  nickname: string;
}

export interface LeagueRow {
  id: string;
  code: string;
  name: string;
  owner_id: string;
}

export interface ScoreRow {
  player_id: string;
  nickname: string;
  puzzle_date: string;
  mode: 'world' | 'hr';
  guesses: number;
  elapsed_ms: number;
}

/**
 * Kod lige: šest znakova bez `0/O` i `1/I/L` — diktira se preko telefona.
 * SPEC §7.4.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function leagueCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Token je 32 nasumična bajta; u bazi živi samo njegov SHA-256. SPEC §7.2. */
export function newToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function uuid(): string {
  return crypto.randomUUID();
}
