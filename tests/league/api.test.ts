import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../netlify/lib/app';
import { memoryStore, type Store } from '../../netlify/lib/store';

/**
 * Cijeli API lige, protiv spremišta u memoriji.
 *
 * Ovi testovi postoje zato što ih prije nije bilo. Backend je živio na Cloudflare
 * Workeru i mogao se provjeriti samo protiv pokrenutog procesa, pa su se ti
 * testovi **preskakali** kad ga nema — i zato je nespojen API u produkciji prošao
 * kroz zeleni paket.
 *
 * Ovdje nema ni mreže ni Netlifyja i nema `skip`: `createApp` prima spremište.
 */

let store: Store;
let app: ReturnType<typeof createApp>;

/** Sat je pinan: runda se računa iz datuma, pa bi inače test ovisio o danu. */
const PINNED = new Date('2026-09-15T10:00:00Z'); // utorak
const TODAY = '2026-09-15';
const FRIDAY = '2026-09-18'; // round_id tjedna koji sadrži pinani dan

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(PINNED);
  store = memoryStore();
  app = createApp(store);
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

/** Prijavi igrača i vrati njegov token. */
async function signUp(nickname: string): Promise<{ token: string; id: string }> {
  const res = await post('/api/players', { nickname });
  return { token: String(res.json.token), id: String(res.json.player_id) };
}

describe('zdravlje i nepoznate rute', () => {
  it('health vraća JSON', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
  });

  it('nepoznata ruta je JSON, ne HTML', async () => {
    /*
     * Ključno: klijent razlikuje „API nije ondje" od greške API-ja po tome je li
     * odgovor JSON. Da ruta vrati HTML, poruka igraču bila bi kriva.
     */
    const res = await app.request('/api/nema-ovoga');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'Nema takve rute' });
  });
});

describe('prijava', () => {
  it('nadimak je cijela registracija', async () => {
    const res = await post('/api/players', { nickname: 'Daniel' });
    expect(res.status).toBe(201);
    expect(res.json.nickname).toBe('Daniel');
    expect(String(res.json.token)).toHaveLength(64);
  });

  it('prazan i predug nadimak se odbijaju', async () => {
    expect((await post('/api/players', { nickname: '   ' })).status).toBe(400);
    expect((await post('/api/players', { nickname: 'x'.repeat(25) })).status).toBe(400);
  });

  it('token se ne sprema u čitljivom obliku', async () => {
    // Curenje spremišta ne smije dati tuđi identitet. SPEC §7.2.
    const { token } = await signUp('Daniel');
    const keys = await store.list('');
    const raw = await Promise.all(keys.map(async (k) => JSON.stringify(await store.get(k))));
    expect(raw.join(' ')).not.toContain(token);
  });

  it('bez tokena nema zaštićenih ruta', async () => {
    expect((await get('/api/me')).status).toBe(401);
    // Samo ASCII: zaglavlja su ByteString i 'š' bi puklo prije nego stigne do koda.
    expect((await get('/api/me', 'izmisljen-token')).status).toBe(401);
  });

  it('`me` vraća nadimak i lige', async () => {
    const { token, id } = await signUp('Daniel');
    const res = await get('/api/me', token);
    expect(res.json).toMatchObject({ player_id: id, nickname: 'Daniel', leagues: [] });
  });
});

describe('liga', () => {
  it('otvaranje daje kod od šest znakova bez zbunjujućih slova', async () => {
    const { token } = await signUp('Daniel');
    const res = await post('/api/leagues', { name: 'Ekipa' }, token);

    expect(res.status).toBe(201);
    // Bez 0/O i 1/I/L — kod se diktira preko telefona. SPEC §7.4.
    expect(String(res.json.code)).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('pridruživanje kodom radi i malim slovima', async () => {
    const owner = await signUp('Daniel');
    const created = await post('/api/leagues', { name: 'Ekipa' }, owner.token);
    const code = String(created.json.code);

    const guest = await signUp('Marta');
    const joined = await post(`/api/leagues/${code.toLowerCase()}/join`, undefined, guest.token);

    expect(joined.status).toBe(200);
    expect(joined.json.name).toBe('Ekipa');
  });

  it('ponovno pridruživanje tiho prolazi i ne udvostručuje člana', async () => {
    const owner = await signUp('Daniel');
    const code = String((await post('/api/leagues', { name: 'Ekipa' }, owner.token)).json.code);

    await post(`/api/leagues/${code}/join`, undefined, owner.token);
    const view = await get(`/api/leagues/${code}`, owner.token);

    expect((view.json.standings as Record<string, unknown[]>).world?.length).toBe(1);
  });

  it('nepostojeći kod je 404, tuđa liga je 403', async () => {
    const owner = await signUp('Daniel');
    const code = String((await post('/api/leagues', { name: 'Ekipa' }, owner.token)).json.code);

    const stranger = await signUp('Netko');
    expect((await get('/api/leagues/ZZZZZZ', stranger.token)).status).toBe(404);
    expect((await get(`/api/leagues/${code}`, stranger.token)).status).toBe(403);
  });

  it('liga se otvara bez ijednog podatka', async () => {
    /*
     * Jedan klik, bez obrasca. Za šestero prijatelja ime lige nije podatak nego
     * prepreka, pa ga poslužitelj izvede iz nadimka.
     */
    const { token } = await signUp('Daniel');

    const res = await post('/api/leagues', {}, token);
    expect(res.status).toBe(201);
    expect(res.json.name).toBe('Daniel i ekipa');
    expect(String(res.json.code)).toHaveLength(6);
  });

  it('prazno ime nije greška nego izostanak imena', async () => {
    const { token } = await signUp('Daniel');
    const res = await post('/api/leagues', { name: '   ' }, token);
    expect(res.status).toBe(201);
    expect(res.json.name).toBe('Daniel i ekipa');
  });

  it('poslano ime se poštuje', async () => {
    const { token } = await signUp('Daniel');
    expect((await post('/api/leagues', { name: 'Ekipa' }, token)).json.name).toBe('Ekipa');
  });

  it('predugo ime je i dalje greška', async () => {
    const { token } = await signUp('Daniel');
    expect((await post('/api/leagues', { name: 'x'.repeat(41) }, token)).status).toBe(400);
  });
});

describe('rezultati', () => {
  async function league() {
    const owner = await signUp('Daniel');
    const code = String((await post('/api/leagues', { name: 'Ekipa' }, owner.token)).json.code);
    return { owner, code };
  }

  it('predaja vraća rundu tjedna', async () => {
    const { owner } = await league();
    const res = await post(
      '/api/scores',
      { puzzle_date: TODAY, mode: 'world', guesses: 3, elapsed_ms: 30_000 },
      owner.token,
    );

    expect(res.status).toBe(200);
    expect(res.json.round_id).toBe(FRIDAY);
  });

  it('neispravan unos se odbija prije nego išta dotakne spremište', async () => {
    const { owner } = await league();
    const base = { puzzle_date: TODAY, mode: 'world', guesses: 3, elapsed_ms: 30_000 };

    for (const [name, patch] of [
      ['nepoznat mod', { mode: 'mjesec' }],
      ['neispravan datum', { puzzle_date: '15.9.2026.' }],
      ['datum nije aktualan', { puzzle_date: '2020-01-01' }],
      ['nula pokušaja', { guesses: 0 }],
      ['necijeli pokušaji', { guesses: 2.5 }],
      ['prebrzo', { elapsed_ms: 10 }],
      ['predugo', { elapsed_ms: 99_999_999 }],
    ] as const) {
      const res = await post('/api/scores', { ...base, ...patch }, owner.token);
      expect(res.status, name).toBe(400);
    }
  });

  it('jedan rezultat po danu i modu; ponovljeni tiho prolazi', async () => {
    const { owner, code } = await league();
    const score = { puzzle_date: TODAY, mode: 'world', guesses: 3, elapsed_ms: 30_000 };

    await post('/api/scores', score, owner.token);
    // Osvježena stranica ne smije izgledati kao greška. SPEC §7.5.
    const again = await post('/api/scores', { ...score, guesses: 1 }, owner.token);
    expect(again.status).toBe(200);

    const view = await get(`/api/leagues/${code}`, owner.token);
    const row = (view.json.standings as Record<string, { guesses: number }[]>).world?.[0];
    // Drugi pokušaj nije prepisao prvi — ostaju tri, ne jedan.
    expect(row?.guesses).toBe(3);
  });

  it('modovi se boduju odvojeno, svaki u svojoj ljestvici', async () => {
    /*
     * Prije su se zbrajali, pa je jedan redak nosio šest pokušaja kroz tri moda
     * i iz njega se nije vidjelo tko je u čemu bolji. Sada svaki mod ima svoju
     * ljestvicu s vlastita dva pokušaja.
     */
    const { owner, code } = await league();
    const base = { puzzle_date: TODAY, guesses: 2, elapsed_ms: 20_000 };

    await post('/api/scores', { ...base, mode: 'world' }, owner.token);
    await post('/api/scores', { ...base, mode: 'capitals' }, owner.token);
    await post('/api/scores', { ...base, mode: 'hr' }, owner.token);

    const view = await get(`/api/leagues/${code}`, owner.token);
    const tables = view.json.standings as Record<string, { guesses: number; points: number }[]>;

    for (const mode of ['world', 'capitals', 'hr']) {
      expect(tables[mode]?.[0]?.guesses, mode).toBe(2);
      expect(tables[mode]?.[0]?.points, mode).toBe(8);
    }
  });
});

describe('otkrivanje tuđih rezultata', () => {
  it('tuđi današnji rezultati su skriveni dok igrač sam ne odigra', async () => {
    const owner = await signUp('Daniel');
    const code = String((await post('/api/leagues', { name: 'Ekipa' }, owner.token)).json.code);
    const guest = await signUp('Marta');
    await post(`/api/leagues/${code}/join`, undefined, guest.token);

    await post(
      '/api/scores',
      { puzzle_date: TODAY, mode: 'world', guesses: 2, elapsed_ms: 20_000 },
      guest.token,
    );

    // Daniel nije odigrao: Martini bodovi se ne vide, ali kvačica se vidi.
    const hidden = await get(`/api/leagues/${code}`, owner.token);
    expect(hidden.json.revealed).toBe(false);
    const marta = (
      hidden.json.standings as Record<
        string,
        { nickname: string; points: number; playedToday: boolean }[]
      >
    ).world?.find((r) => r.nickname === 'Marta');
    expect(marta?.points).toBe(0);
    expect(marta?.playedToday).toBe(true);

    // Čim odigra, vidi sve.
    await post(
      '/api/scores',
      { puzzle_date: TODAY, mode: 'world', guesses: 4, elapsed_ms: 40_000 },
      owner.token,
    );
    const shown = await get(`/api/leagues/${code}`, owner.token);
    expect(shown.json.revealed).toBe(true);
    const martaNow = (
      shown.json.standings as Record<string, { nickname: string; points: number }[]>
    ).world?.find((r) => r.nickname === 'Marta');
    expect(martaNow?.points).toBeGreaterThan(0);
  });
});
