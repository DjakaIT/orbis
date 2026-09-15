import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, UNREACHABLE, createPlayer, me } from '../../src/league/client';

/**
 * Ponasanje klijenta lige kad API nije ondje.
 *
 * Ovo je test koji je nedostajao. U produkciji je prijava slala nadimak i
 * dobivala natrag 404 stranicu hostinga, jer proxy `/api/*` nije bio podesen —
 * a igracu je pisalo doslovno „HTTP 404". Testovi lige su tada preskakali
 * (`test.skip` kad Worker nije pokrenut), pa je sve bilo zeleno.
 *
 * Ovdje se ne trazi Worker. Provjerava se sto klijent radi s odgovorom koji nije
 * iz Workera, a to je tocno ono sto se dogodilo.
 */

/** Zadnji poziv `fetch`, tipiziran — mock ga inace vraca kao prazan niz. */
function lastCall(mock: { mock: { calls: unknown[][] } }): RequestInit {
  const call = mock.mock.calls.at(-1);
  if (!call) throw new Error('fetch nije ni pozvan');
  return call[1] as RequestInit;
}

function respond(body: string, init: { status?: number; type?: string }): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.type === undefined ? {} : { 'content-type': init.type },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kad API nije dostupan', () => {
  it('HTML stranica hostinga ne postaje „HTTP 404"', async () => {
    // Netlify bez `/api/*` pravila vraca svoju 404 stranicu, dakle HTML.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          respond('<!doctype html><title>Not Found</title>', {
            status: 404,
            type: 'text/html; charset=utf-8',
          }),
        ),
      ),
    );

    await expect(createPlayer('Daniel')).rejects.toThrow(UNREACHABLE);
    await expect(createPlayer('Daniel')).rejects.not.toThrow('HTTP 404');
  });

  it('prazan odgovor bez tipa je isto nedostupnost', async () => {
    // `vite preview` na nepoznatoj ruti vraca 404 bez tijela i bez content-type.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(respond('', { status: 404 }))),
    );
    await expect(createPlayer('Daniel')).rejects.toThrow(UNREACHABLE);
  });

  it('pala mreza ili CORS takoder', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const error = await createPlayer('Daniel').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe(UNREACHABLE);
    // Status 0 znaci da odgovora nije ni bilo; 404 bi lagao da je server odgovorio.
    expect((error as ApiError).status).toBe(0);
  });

  it('poruka ne ostavlja igraca da misli da je igra puknula', () => {
    expect(UNREACHABLE).toContain('Igra radi');
  });
});

describe('kad API jest dostupan', () => {
  it('prolazi kroz tijelo odgovora', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          respond(JSON.stringify({ player_id: 'p1', token: 't', nickname: 'Daniel' }), {
            type: 'application/json',
          }),
        ),
      ),
    );

    await expect(createPlayer('Daniel')).resolves.toMatchObject({ nickname: 'Daniel' });
  });

  it('cuva poruku greske koju je Worker poslao', async () => {
    // Prave greske API-ja moraju ostati citljive; ne smiju se progutati u „nedostupno".
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          respond(JSON.stringify({ error: 'Nadimak je obavezan' }), {
            status: 400,
            type: 'application/json',
          }),
        ),
      ),
    );

    const error = await createPlayer('').catch((e: unknown) => e);
    expect((error as ApiError).message).toBe('Nadimak je obavezan');
    expect((error as ApiError).status).toBe(400);
  });

  it('salje nadimak u tijelu, kao JSON', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        respond(JSON.stringify({ player_id: 'p1', token: 't', nickname: 'Daniel' }), {
          type: 'application/json',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createPlayer('Daniel');

    const init = lastCall(fetchMock);
    expect(init.method).toBe('POST');
    // Tijelo je uvijek niz — `call` ga serijalizira prije slanja.
    expect(JSON.parse(typeof init.body === 'string' ? init.body : '')).toEqual({
      nickname: 'Daniel',
    });
  });

  it('nosi token u zaglavlju kad ga ima', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        respond(JSON.stringify({ player_id: 'p1', nickname: 'Daniel', leagues: [] }), {
          type: 'application/json',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await me('tajna');

    const headers = lastCall(fetchMock).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tajna');
  });
});
