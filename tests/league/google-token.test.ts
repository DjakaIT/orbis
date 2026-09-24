import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetDiscovery, verifyGoogleToken } from '../../netlify/lib/google';

/**
 * Provjera Googleova potpisa.
 *
 * Ovdje se ne glumi kriptografija: test generira pravi RSA par, potpiše pravi
 * JWT i posluži pravi JWKS. Lažiran je samo `fetch`, jer bi inače test ovisio o
 * Googleovoj dostupnosti — a test koji pada zbog tuđe mreže prestane se čitati.
 *
 * Najvažnija tvrdnja je ona o `aud`. Token izdan **drugoj** aplikaciji je
 * savršeno valjano potpisan Googleovim ključem; bez provjere publike bi njime
 * mogao ući bilo tko tko ima bilo koju Google aplikaciju. To je klasičan propust
 * u ovakvim integracijama, ne egzotičan napad.
 */

const CLIENT_ID = '123456789-orbis.apps.googleusercontent.com';
const ISSUER = 'https://accounts.google.com';
const JWKS_URI = 'https://www.googleapis.test/oauth2/v3/certs';

let keys: CryptoKeyPair;
let jwk: JsonWebKey;
let otherKeys: CryptoKeyPair;

/** Sat je pinan da `exp` i `iat` ne ovise o trenutku izvođenja. */
const NOW = new Date('2026-09-22T10:00:00Z');
const seconds = (d: Date): number => Math.floor(d.getTime() / 1000);

async function rsa(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
}

/** Adresa zahtjeva, bez obzira dolazi li kao string, URL ili Request. */
const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const KID = 'orbis-test-key';

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const encode = (value: unknown): string => b64url(new TextEncoder().encode(JSON.stringify(value)));

/**
 * Token kakav Google izda, uz mogućnost da se bilo koje polje pokvari.
 *
 * Potpisuje se ručno, a ne `Jwt.sign`, zbog **`kid`**: Hono ga traži u zaglavlju
 * kad ključ dolazi iz JWKS-a, i s pravom — to je ono što kaže kojim je od
 * Googleovih ključeva token potpisan. `Jwt.sign` ga ne zna upisati, pa bi test
 * bez ovoga provjeravao token kakav Google nikad ne izda.
 */
async function idToken(
  overrides: Record<string, unknown> = {},
  signWith: CryptoKey = keys.privateKey,
): Promise<string> {
  const payload = {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: 'g-daniel',
    name: 'Daniel',
    iat: seconds(NOW) - 60,
    exp: seconds(NOW) + 3600,
    ...overrides,
  };

  const signing = `${encode({ alg: 'RS256', typ: 'JWT', kid: KID })}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signWith,
    new TextEncoder().encode(signing),
  );
  return `${signing}.${b64url(new Uint8Array(signature))}`;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  forgetDiscovery();

  keys ??= await rsa();
  otherKeys ??= await rsa();
  jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);

  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = urlOf(input);

    // OpenID Discovery: odatle se čita gdje ključevi žive. SPEC §4.1.
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return Promise.resolve(
        new Response(JSON.stringify({ issuer: ISSUER, jwks_uri: JWKS_URI }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    if (url === JWKS_URI) {
      return Promise.resolve(
        new Response(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('ne postoji', { status: 404 }));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('valjan token', () => {
  it('prolazi i vraća sub i ime', async () => {
    const account = await verifyGoogleToken(await idToken(), CLIENT_ID);
    expect(account).toEqual({ sub: 'g-daniel', name: 'Daniel' });
  });

  it('adresa ključeva se čita iz konfiguracije, ne upisuje', async () => {
    // Da je adresa upisana rukom, ovaj bi `fetch` na discovery bio nepotreban.
    const seen: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      seen.push(urlOf(input));
      if (urlOf(input).endsWith('/.well-known/openid-configuration')) {
        return Promise.resolve(
          new Response(JSON.stringify({ jwks_uri: JWKS_URI }), {
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    await verifyGoogleToken(await idToken(), CLIENT_ID);
    expect(seen[0]).toBe(`${ISSUER}/.well-known/openid-configuration`);
    expect(seen).toContain(JWKS_URI);
  });

  it('ime bez sadržaja postaje null, ne prazan nadimak', async () => {
    const account = await verifyGoogleToken(await idToken({ name: '   ' }), CLIENT_ID);
    expect(account.name).toBeNull();
  });

  it('ime koje uopće nije poslano postaje null', async () => {
    const account = await verifyGoogleToken(await idToken({ name: undefined }), CLIENT_ID);
    expect(account.name).toBeNull();
  });
});

describe('odbijanje', () => {
  const rejects = (promise: Promise<unknown>) => expect(promise).rejects.toThrow();

  it('token izdan drugoj aplikaciji ne prolazi', async () => {
    // Valjano potpisan Googleom, ali nije za nas. Bez ove provjere prolazi svatko.
    await rejects(
      verifyGoogleToken(await idToken({ aud: 'tuda-app.apps.googleusercontent.com' }), CLIENT_ID),
    );
  });

  it('token potpisan tuđim ključem ne prolazi', async () => {
    await rejects(verifyGoogleToken(await idToken({}, otherKeys.privateKey), CLIENT_ID));
  });

  it('istekao token ne prolazi', async () => {
    await rejects(verifyGoogleToken(await idToken({ exp: seconds(NOW) - 10 }), CLIENT_ID));
  });

  it('token iz budućnosti ne prolazi', async () => {
    await rejects(verifyGoogleToken(await idToken({ iat: seconds(NOW) + 600 }), CLIENT_ID));
  });

  it('tuđi izdavatelj ne prolazi', async () => {
    /*
     * Potpis je naš jer test posjeduje ključ, ali `iss` nije Googleov. Provjera
     * izdavatelja je zasebna i mora stajati i kad potpis prođe.
     */
    await rejects(verifyGoogleToken(await idToken({ iss: 'https://zli.example' }), CLIENT_ID));
  });

  it('token bez sub ne prolazi', async () => {
    // Bez `sub` nema identiteta; prihvatiti ga značilo bi vezati igrača ni za što.
    await rejects(verifyGoogleToken(await idToken({ sub: '' }), CLIENT_ID));
  });

  it('smeće umjesto tokena ne prolazi', async () => {
    await rejects(verifyGoogleToken('ovo.nije.jwt', CLIENT_ID));
    await rejects(verifyGoogleToken('', CLIENT_ID));
  });

  it('bez client ID-a se ni ne pokušava', async () => {
    await rejects(verifyGoogleToken(await idToken(), ''));
  });

  it('nedostupna Googleova konfiguracija je greška, ne tihi prolaz', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('pao', { status: 503 })));
    forgetDiscovery();
    await rejects(verifyGoogleToken(await idToken(), CLIENT_ID));
  });
});

describe('poruke greške', () => {
  it('ne odaju zašto je token odbijen', async () => {
    /*
     * Igraču je svejedno je li token istekao ili je bio za drugu aplikaciju, a
     * razlika bi napadaču rekla gdje da gura. Jedna poruka za sve.
     */
    const reasons = [
      await idToken({ aud: 'tuda.apps.googleusercontent.com' }),
      await idToken({ exp: seconds(NOW) - 10 }),
      await idToken({}, otherKeys.privateKey),
    ];

    const messages = new Set<string>();
    for (const token of reasons) {
      await verifyGoogleToken(token, CLIENT_ID).catch((e: unknown) => {
        messages.add((e as Error).message);
      });
    }
    expect(messages.size).toBe(1);
  });
});
