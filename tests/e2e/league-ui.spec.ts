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
      return json({ league_id: 'l1', code: 'ABCDEF', name: 'Ekipa' }, 201);
    }
    if (url.endsWith('/rounds')) {
      return json({ rounds: [] });
    }
    if (url.endsWith('/api/scores')) {
      return json({ ok: true, round_id: '2026-09-18', round_closed: false });
    }
    if (url.includes('/api/leagues/')) {
      return json({
        name: 'Ekipa',
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
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Liga' }).click();
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

test('otvorena liga prikazuje kod i ljestvicu', async ({ page }) => {
  const api = await stubApi(page);
  await signUp(page);

  await page.getByLabel('Ime lige').fill('Ekipa');
  await page.getByRole('button', { name: 'Otvori' }).click();

  await expect(page.getByText('Ekipa')).toBeVisible({ timeout: 15_000 });
  // Kod se diktira preko telefona, pa mora biti vidljiv. SPEC §7.4.
  await expect(page.getByText('ABCDEF')).toBeVisible();

  await expect(page.getByRole('listitem').filter({ hasText: 'Daniel' })).toHaveCount(1);
  await expect(page.getByRole('listitem').filter({ hasText: 'Marta' })).toHaveCount(1);

  expect(api.posted.some((p) => p.url.endsWith('/api/leagues'))).toBe(true);
});

test('kvačica pokazuje tko je odigrao, i prije nego se vide bodovi', async ({ page }) => {
  await stubApi(page);
  await signUp(page);
  await page.getByLabel('Ime lige').fill('Ekipa');
  await page.getByRole('button', { name: 'Otvori' }).click();
  await expect(page.getByText('Ekipa')).toBeVisible({ timeout: 15_000 });

  const daniel = page.getByRole('listitem').filter({ hasText: 'Daniel' });
  const marta = page.getByRole('listitem').filter({ hasText: 'Marta' });

  await expect(daniel).toContainText('✓');
  // Marta nije odigrala — točkice, ne kvačica.
  await expect(marta).toContainText('⋯');
});
