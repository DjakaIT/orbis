/**
 * Provjera Google ID tokena. SPEC §7.2 (odstupanje, vidi DECISIONS.md).
 *
 * Preglednik od Googlea dobije potpisani JWT i pošalje ga ovamo. Poslužitelj mu
 * provjeri potpis Googleovim javnim ključem, pa iz njega uzme `sub` — trajni
 * identifikator računa. Ništa se ne vjeruje na riječ: ni ime, ni e-pošta, ni
 * `sub`, dok potpis ne prođe.
 *
 * Bez nove ovisnosti: `hono/utils/jwt` nosi `verifyWithJwks`, a Hono je već tu
 * kao router. SPEC §1.
 *
 * Adresa ključeva se **ne upisuje rukom**. OpenID Connect Discovery propisuje da
 * svaki izdavatelj svoju konfiguraciju drži na `{issuer}/.well-known/openid-configuration`,
 * pa se `jwks_uri` čita odande. To je izvedeno iz standarda, ne izmišljeno — SPEC §4.1.
 */

import { Jwt } from 'hono/utils/jwt';

/** Google potpisuje kao jedno od ova dva; oba su ispravna i oba se pojavljuju. */
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Izdavatelj iz kojeg se izvodi adresa konfiguracije. */
const ISSUER = 'https://accounts.google.com';

/** Google potpisuje RS256. Popis je zatvoren namjerno: `alg` iz tokena se ne sluša. */
const ALGORITHMS = ['RS256'] as const;

/** Koliko se dugo drži pročitani `jwks_uri` prije ponovnog čitanja. */
const DISCOVERY_TTL_MS = 3_600_000;

export interface GoogleAccount {
  /** Trajni identifikator Google računa. Ne mijenja se ni s promjenom e-pošte. */
  sub: string;
  /** Ime s računa, ako ga je korisnik dao. Koristi se samo kao ponuđeni nadimak. */
  name: string | null;
}

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

let cached: { uri: string; at: number } | null = null;

/** `jwks_uri` iz Googleove OpenID konfiguracije, s kratkim pamćenjem. */
async function jwksUri(now: number): Promise<string> {
  if (cached && now - cached.at < DISCOVERY_TTL_MS) return cached.uri;

  const res = await fetch(`${ISSUER}/.well-known/openid-configuration`);
  if (!res.ok) throw new GoogleAuthError('Google konfiguracija nije dostupna');

  const doc = (await res.json()) as { jwks_uri?: unknown };
  if (typeof doc.jwks_uri !== 'string') {
    throw new GoogleAuthError('Google konfiguracija nema jwks_uri');
  }

  cached = { uri: doc.jwks_uri, at: now };
  return doc.jwks_uri;
}

/** Samo za testove: zaboravi zapamćenu adresu ključeva. */
export function forgetDiscovery(): void {
  cached = null;
}

/**
 * Provjeri token i vrati račun, ili baci.
 *
 * `aud` mora biti **naš** client ID. Bez te provjere bi prošao i valjano
 * potpisan token izdan nekoj sasvim drugoj aplikaciji, pa bi se njime moglo ući
 * ovamo — to je i klasična greška u ovakvim integracijama, a ne egzotičan napad.
 */
export async function verifyGoogleToken(
  credential: string,
  clientId: string,
  now: number = Date.now(),
): Promise<GoogleAccount> {
  if (!clientId) throw new GoogleAuthError('Google prijava nije podešena');
  if (!credential) throw new GoogleAuthError('Nedostaje Google token');

  let payload;
  try {
    payload = await Jwt.verifyWithJwks(credential, {
      jwks_uri: await jwksUri(now),
      allowedAlgorithms: ALGORITHMS,
      verification: { aud: clientId },
    });
  } catch {
    // Isteklo, krivo potpisano, za drugu aplikaciju — igraču je sve to isto.
    throw new GoogleAuthError('Google prijava nije prošla');
  }

  if (typeof payload.iss !== 'string' || !ISSUERS.includes(payload.iss)) {
    throw new GoogleAuthError('Google prijava nije prošla');
  }
  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new GoogleAuthError('Google prijava nije prošla');
  }

  return {
    sub: payload.sub,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null,
  };
}

/** Kakvu provjeru `createApp` očekuje. Testovi na ovo mjesto stavljaju svoju. */
export type VerifyGoogle = (credential: string) => Promise<GoogleAccount>;

/** Provjera vezana uz client ID iz okoline. */
export function googleVerifier(clientId: string): VerifyGoogle {
  return (credential) => verifyGoogleToken(credential, clientId);
}
