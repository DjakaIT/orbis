/**
 * Kodovi, tokeni i identifikatori. Preneseno iz Workera bez izmjene značenja.
 *
 * `crypto` je ovdje Web Crypto, koji Netlifyjeve funkcije imaju kao i Workeri.
 */

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

/** Token je 32 nasumična bajta; spremljen je samo njegov SHA-256. SPEC §7.2. */
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
