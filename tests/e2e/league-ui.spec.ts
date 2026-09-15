import { expect, test, type Page } from '@playwright/test';

/**
 * Sučelje lige, protiv presretnutog API-ja.
 *
 * Prije je ovo tražilo pokrenut Cloudflare Worker i **preskakalo se** kad ga nema.
 * Takav test je bio zelen i kad liga u produkciji uopće nije radila.
 *
 * Sada se odgovori presreću u pregledniku: test se uvijek izvršava, ne treba mu
 * ni poslužitelj ni baza, a provjerava točno ono što je sučelje dužno — što šalje
 * i što nacrta od onoga što dobije. Sama logika API-ja pokrivena je u
 * `tests/league/`, protiv spremišta u memoriji.
 */

/*
 * Duži rok po testu nego zadanih 30 s.
 *
 * Panel lige ne ovisi ni o podacima svijeta ni o globusu, ali svaki `goto('/')`
 * svejedno digne WebGL kontekst koji ovim testovima ne treba — a to je ovdje
 * najskuplja stvar na stranici. Sami prođu za ~4 s; pod paralelnim paketom, gdje
 * se četiri globusa otimaju za GPU, znaju probiti 30 s. Rok je zato vezan uz
 * stvarni trošak stranice, a nijedna tvrdnja nije olabavljena.
 */
test.describe.configure({ timeout: 60_000 });

interface Standing {
  playerId: string;
  nickname: string;
  points: number;
  guesses: number;
  elapsedMs: number;
  playedToday: boolean;
  rank: number;
}

function standing(nickname: string, rank: number, points: number, played = true): Standing {
  return {
    playerId: `p-${nickname}`,
    nickname,
    points,
    guesses: 3,
    elapsedMs: 30_000,
    playedToday: played,
    rank,
  };
}

/** Lažni API lige. Bilježi što je sučelje poslalo. */
async function stubApi(page: Page): Promise<{ posted: { url: string; body: unknown }[] }> {
  const posted: { url: string; body: unknown }[] = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname;

    if (request.method() === 'POST') {
      posted.push({ url, body: JSON.parse(request.postData() ?? 'null') });
    }

    const json = (body: unknown, status = 200): Promise<void> =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.endsWith('/api/players')) {
      return json({ player_id: 'p-Daniel', token: 'token-daniel', nickname: 'Daniel' }, 201);
    }
    if (url.endsWith('/api/me')) {
      return json({ player_id: 'p-Daniel', nickname: 'Daniel', leagues: [] });
    }
    if (url.endsWith('/api/leagues')) {
      return json({ league_id: 'l1', code: 'ABCDEF', name: 'Daniel i ekipa' }, 201);
    }
    if (url.endsWith('/rounds')) {
      return json({ rounds: [] });
    }
    if (url.endsWith('/api/scores')) {
      return json({ ok: true, round_id: '2026-09-18', round_closed: false });
    }
    if (url.includes('/api/leagues/')) {
      return json({
        name: 'Daniel i ekipa',
        code: 'ABCDEF',
        round_id: '2026-09-18',
        closes_at: Date.now() + 86_400_000,
        standings: [standing('Daniel', 1, 5), standing('Marta', 2, 3, false)],
        everyone_done: false,
        revealed: true,
      });
    }
    return json({ error: 'Nema takve rute' }, 404);
  });

  return { posted };
}

async function signUp(page: Page): Promise<void> {
  await page.goto('/');

  /*
   * Ne ceka se da igra bude spremna. Liga je svoj panel i ne ovisi o podacima
   * svijeta ni o globusu; cekanje na `Upiši državu` je ovdje samo vezalo test
   * uz ucitavanje 1 MB podataka i WebGL kontekst, pa je pod punim paketom znalo
   * probiti rok. Ceka se ono sto se stvarno koristi.
   */
  const liga = page.getByRole('button', { name: 'Liga' });
  await expect(liga).toBeVisible({ timeout: 15_000 });
  await liga.click();
  const nickname = page.getByLabel('Nadimak');
  await expect(nickname).toBeVisible();
  await nickname.fill('Daniel');
  await page.getByRole('button', { name: 'Uđi' }).click();
}

test('prijava šalje nadimak i pokazuje link za povrat', async ({ page }) => {
  const api = await stubApi(page);
  await signUp(page);

  // Link za povrat se pokazuje jednom, odmah nakon prijave. SPEC §7.2.
  await expect(page.getByText(/Spremi ovaj link/)).toBeVisible({ timeout: 15_000 });

  expect(api.posted[0]?.url).toContain('/api/players');
  expect(api.posted[0]?.body).toEqual({ nickname: 'Daniel' });
});

test('liga se otvara jednim klikom, bez ijednog polja', async ({ page }) => {
  const api = await stubApi(page);
  await signUp(page);

  // Nema obrasca: prije je ovdje trebalo smisliti i upisati ime lige.
  await expect(page.getByLabel('Ime lige')).toHaveCount(0);
  await page.getByRole('button', { name: 'Napravi ligu' }).click();

  await expect(page.getByText('Daniel i ekipa')).toBeVisible({ timeout: 15_000 });

  const posted = api.posted.find((p) => p.url.endsWith('/api/leagues'));
  expect(posted).toBeDefined();
  // Bez imena u tijelu — poslužitelj ga izvodi iz nadimka.
  expect(posted?.body).toEqual({});
});

test('nakon otvaranja kod stoji velik, s gumbom za kopiranje', async ({ page }) => {
  await stubApi(page);
  await signUp(page);
  await page.getByRole('button', { name: 'Napravi ligu' }).click();

  /*
   * Kod je jedino što osnivač mora proslijediti da liga postoji, pa se traži u
   * vlastitoj kartici, a ne u rečenici u podnožju gdje je prije stajao.
   */
  const invite = page.getByRole('region', { name: 'Kod lige' });
  await expect(invite).toBeVisible({ timeout: 15_000 });
  await expect(invite.getByText('ABCDEF')).toBeVisible();
  await expect(invite.getByRole('button', { name: 'Kopiraj' })).toBeVisible();
});

test('ulazak u tuđu ligu je kod i ništa više', async ({ page }) => {
  const api = await stubApi(page);
  await signUp(page);

  // Polje za kod se ne pokazuje dok netko ne kaže da ga ima.
  await expect(page.getByLabel('Kod lige')).toHaveCount(0);
  await page.getByRole('button', { name: 'Imam kod' }).click();

  await page.getByLabel('Kod lige').fill('abcdef');
  await page.getByRole('button', { name: 'Uđi' }).click();

  await expect(page.getByRole('listitem').filter({ hasText: 'Marta' })).toHaveCount(1, {
    timeout: 15_000,
  });
  // Mala slova se šalju kao velika — kod se diktira, ne prepisuje točno.
  expect(api.posted.some((p) => p.url.includes('/api/leagues/ABCDEF/join'))).toBe(true);
});

test('kvačica pokazuje tko je odigrao, i prije nego se vide bodovi', async ({ page }) => {
  await stubApi(page);
  await signUp(page);
  await page.getByRole('button', { name: 'Napravi ligu' }).click();
  await expect(page.getByText('Daniel i ekipa')).toBeVisible({ timeout: 15_000 });

  const daniel = page.getByRole('listitem').filter({ hasText: 'Daniel' });
  const marta = page.getByRole('listitem').filter({ hasText: 'Marta' });

  await expect(daniel).toContainText('✓');
  // Marta nije odigrala — točkice, ne kvačica.
  await expect(marta).toContainText('⋯');
});
