import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../netlify/lib/app';
import { playerByIdentity } from '../../netlify/lib/data';
import type { GoogleAccount } from '../../netlify/lib/google';
import { memoryStore, type Store } from '../../netlify/lib/store';

/**
 * Prijava Googleom, protiv spremišta u memoriji.
 *
 * Provjera potpisa je ovdje zamijenjena — nju pokriva `verifyGoogleToken`
 * odvojeno. Ovdje se testira ono što je stvarno odluka, a ne kriptografija:
 * **kojeg igrača** prijava pogodi. Pogriješiti tu znači tiho odvojiti čovjeka od
 * njegove lige, a to izgleda potpuno isto kao da sve radi.
 */

let store: Store;
let app: ReturnType<typeof createApp>;

/** Računi koje lažna provjera prihvaća, po tokenu. */
const ACCOUNTS: Record<string, GoogleAccount> = {
  'tok-daniel': { sub: 'g-daniel', name: 'Daniel Rajić' },
  'tok-marta': { sub: 'g-marta', name: 'Marta' },
  'tok-bez-imena': { sub: 'g-tiho', name: null },
  'tok-dugo-ime': { sub: 'g-dugo', name: 'Bartolomej Aleksandar Maksimilijan Petrović' },
};

function verifyGoogle(credential: string): Promise<GoogleAccount> {
  const account = ACCOUNTS[credential];
  if (!account) return Promise.reject(new Error('nevaljan token'));
  return Promise.resolve(account);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-22T10:00:00Z'));
  store = memoryStore();
  app = createApp(store, { verifyGoogle });
});

afterEach(() => {
  vi.useRealTimers();
});

async function post(path: string, body?: unknown, token?: string) {
  const res = await app.request(path, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function get(path: string, token?: string) {
  const res = await app.request(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const signIn = (credential: string, token?: string) =>
  post('/api/auth/google', { credential }, token);

describe('prva prijava', () => {
  it('stvara igrača i uzima ime s računa', async () => {
    const res = await signIn('tok-daniel');
    expect(res.status).toBe(201);
    expect(res.json.nickname).toBe('Daniel Rajić');
    expect(String(res.json.token)).toHaveLength(64);
  });

  it('račun bez imena svejedno prolazi', async () => {
    // Google ne jamči `name`. Bez zamjene bi prijava pukla na praznom nadimku.
    const res = await signIn('tok-bez-imena');
    expect(res.status).toBe(201);
    expect(String(res.json.nickname).length).toBeGreaterThan(0);
  });

  it('predugo ime se skraćuje, ne odbija', async () => {
    const res = await signIn('tok-dugo-ime');
    expect(res.status).toBe(201);
    expect(String(res.json.nickname).length).toBeLessThanOrEqual(24);
  });

  it('dobiveni token odmah radi', async () => {
    const token = String((await signIn('tok-daniel')).json.token);
    const me = await get('/api/me', token);
    expect(me.status).toBe(200);
    expect(me.json.nickname).toBe('Daniel Rajić');
    expect(me.json.linked).toEqual(['google']);
  });
});

describe('ponovna prijava', () => {
  it('isti račun vodi na istog igrača, s drugog uređaja', async () => {
    /*
     * Ovo je cijela svrha prijave. Prije je isti čovjek s drugog uređaja bio novi
     * igrač, jer je nadimak bio jedino što je imao.
     */
    const first = await signIn('tok-daniel');
    const second = await signIn('tok-daniel');

    expect(second.status).toBe(200);
    expect(second.json.player_id).toBe(first.json.player_id);
  });

  it('svaki uređaj dobiva svoj token, a stari i dalje radi', async () => {
    const phone = String((await signIn('tok-daniel')).json.token);
    const laptop = String((await signIn('tok-daniel')).json.token);

    expect(laptop).not.toBe(phone);
    // Prijava na prijenosniku ne smije izbaciti mobitel.
    expect((await get('/api/me', phone)).status).toBe(200);
    expect((await get('/api/me', laptop)).status).toBe(200);
  });

  it('različiti računi su različiti igrači', async () => {
    const a = await signIn('tok-daniel');
    const b = await signIn('tok-marta');
    expect(a.json.player_id).not.toBe(b.json.player_id);
  });
});

describe('vezanje postojećeg igrača', () => {
  it('nadimak koji je već ovdje zadrži svog igrača', async () => {
    /*
     * Najvažniji slučaj. Igrač je već u ligi pod nadimkom; prijava mora vezati
     * **njega**, a ne napraviti novog — inače tiho ostane bez svoje ekipe, a sve
     * izgleda kao da radi.
     */
    const created = await post('/api/players', { nickname: 'Dado' });
    const token = String(created.json.token);

    const signed = await signIn('tok-daniel', token);
    expect(signed.json.player_id).toBe(created.json.player_id);
    // Nadimak koji je sam izabrao ostaje; Google ga ne prepisuje.
    expect(signed.json.nickname).toBe('Dado');
  });

  it('liga preživi prijavu', async () => {
    const created = await post('/api/players', { nickname: 'Dado' });
    const token = String(created.json.token);
    const league = await post('/api/leagues', {}, token);
    const code = String(league.json.code);

    const signed = await signIn('tok-daniel', token);
    const me = await get('/api/me', String(signed.json.token));

    expect((me.json.leagues as { code: string }[]).map((l) => l.code)).toContain(code);
  });

  it('stari token nastavlja raditi i nakon vezanja', async () => {
    const created = await post('/api/players', { nickname: 'Dado' });
    const token = String(created.json.token);
    await signIn('tok-daniel', token);
    expect((await get('/api/me', token)).status).toBe(200);
  });

  it('veza se ne udvostručuje pri svakoj prijavi', async () => {
    const created = await post('/api/players', { nickname: 'Dado' });
    const token = String(created.json.token);
    await signIn('tok-daniel', token);
    await signIn('tok-daniel', token);

    const me = await get('/api/me', token);
    expect(me.json.linked).toEqual(['google']);
  });
});

describe('uređaj već drži drugog igrača', () => {
  it('prijava vodi u vezanog igrača, ne u onog na uređaju', async () => {
    // Trajni identitet pobjeđuje; nagađati spajanje dvaju igrača ne valja.
    const google = await signIn('tok-daniel');
    const local = await post('/api/players', { nickname: 'Netko drugi' });

    const again = await signIn('tok-daniel', String(local.json.token));
    expect(again.json.player_id).toBe(google.json.player_id);
  });

  it('odgovor kaže da se igrač promijenio', async () => {
    /*
     * Tiha zamjena identiteta je najgora varijanta: čovjek gleda tuđu ljestvicu i
     * ne zna zašto. Sučelje to mora moći reći, pa poslužitelj mora to javiti.
     */
    await signIn('tok-daniel');
    const local = await post('/api/players', { nickname: 'Netko drugi' });

    const again = await signIn('tok-daniel', String(local.json.token));
    expect(again.json.switched).toBe(true);
  });

  it('bez zamjene nema upozorenja', async () => {
    const created = await post('/api/players', { nickname: 'Dado' });
    const signed = await signIn('tok-daniel', String(created.json.token));
    expect(signed.json.switched).toBe(false);
  });
});

describe('odbijanje', () => {
  it('nevaljan token je 401, ne 500', async () => {
    const res = await signIn('izmišljeno');
    expect(res.status).toBe(401);
    expect(String(res.json.error)).toMatch(/Google/);
  });

  it('prazno tijelo je 400', async () => {
    expect((await post('/api/auth/google', {})).status).toBe(400);
    expect((await post('/api/auth/google')).status).toBe(400);
  });

  it('odbijena prijava ne stvara igrača', async () => {
    await signIn('izmišljeno');
    expect(await playerByIdentity(store, 'google', 'g-daniel')).toBeNull();
  });

  it('bez podešene provjere ruta jasno kaže da nije podešena', async () => {
    /*
     * Ovo je stanje u kojem projekt živi dok se ne postavi `GOOGLE_CLIENT_ID`.
     * Mora biti prepoznatljivo, a ne 500 ili tiha 404 — na tome je već jednom
     * izgorjela liga.
     */
    const bare = createApp(memoryStore());
    const res = await bare.request('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'tok-daniel' }),
    });
    expect(res.status).toBe(501);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('igra i liga preko nadimka rade i bez podešene prijave', async () => {
    const bare = createApp(memoryStore());
    const res = await bare.request('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Dado' }),
    });
    expect(res.status).toBe(201);
  });
});
