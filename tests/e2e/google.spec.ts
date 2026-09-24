import type { Page, Route } from '@playwright/test';

import { expect, signOut, test } from './fixtures';

/**
 * Prijava Googleom, od gumba do spremljenog igrača.
 *
 * Googleova knjižnica se zamjenjuje u pregledniku, prije nego aplikacija krene.
 * Pravi Google ovdje ne bi bio test nego ovisnost o tuđem računu i tuđoj mreži,
 * a i tražio bi da netko stvarno klikne po njihovom prozoru. Ono što je naše —
 * da se gumb pojavi, da token ode poslužitelju, i da se igrač zapamti — ovako se
 * provjerava bez ijednog preskakanja.
 *
 * Sam potpis i odluka o tome kojeg igrača prijava pogodi pokriveni su u
 * `tests/league/google*.test.ts`, protiv spremišta u memoriji.
 */

/*
 * Duži rok po testu nego zadanih 30 s, iz istog razloga kao u `league-ui.spec.ts`:
 * prijava ne dira ni podatke svijeta ni globus, ali svaki `goto('/')` svejedno
 * digne WebGL kontekst, a pod punim paketom se četiri takva otimaju za GPU.
 * Nijedna tvrdnja nije olabavljena, samo rok.
 */
test.describe.configure({ timeout: 60_000 });

const CREDENTIAL = 'lazni.google.token';

/** Panel lige treba dohvat `/api/me` prije nego zna nudi li prijavu. */
const SLOW = { timeout: 15_000 };

/**
 * Lažni `google.accounts.id`.
 *
 * Nacrta obični gumb u element koji mu aplikacija da i, na klik, javi token —
 * točno ono što prava knjižnica radi, bez iframea i bez mreže.
 */
async function stubGoogle(page: Page): Promise<void> {
  await page.addInitScript((credential: string) => {
    let callback: ((r: { credential: string }) => void) | null = null;

    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize(config: { callback: (r: { credential: string }) => void }) {
            callback = config.callback;
          },
          renderButton(parent: HTMLElement) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Nastavi s Googleom';
            button.addEventListener('click', () => {
              callback?.({ credential });
            });
            parent.replaceChildren(button);
          },
        },
      },
    };
  }, CREDENTIAL);
}

interface Seen {
  credential: unknown;
  authorization: string | null;
}

/** API lige, presretnut. Bilježi što je prijava poslala. */
async function stubApi(
  page: Page,
  options: { linked?: string[]; switched?: boolean; status?: number } = {},
): Promise<Seen[]> {
  const seen: Seen[] = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200): Promise<void> =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.endsWith('/api/auth/google')) {
      seen.push({
        credential: (JSON.parse(request.postData() ?? '{}') as { credential?: unknown }).credential,
        authorization: request.headers().authorization ?? null,
      });
      if (options.status && options.status >= 400) {
        return json({ error: 'Google prijava nije prošla' }, options.status);
      }
      return json(
        {
          player_id: 'p-google',
          token: 'g'.repeat(64),
          nickname: 'Daniel Rajić',
          switched: options.switched ?? false,
        },
        201,
      );
    }

    if (url.endsWith('/api/me')) {
      return json({
        player_id: 'p-google',
        nickname: 'Daniel Rajić',
        linked: options.linked ?? ['google'],
        leagues: [],
      });
    }
    if (url.endsWith('/api/players')) {
      return json({ player_id: 'p-nick', token: 'n'.repeat(64), nickname: 'Daniel' }, 201);
    }
    return json({ error: 'Nema takve rute' }, 404);
  });

  return seen;
}

/** Ono što je aplikacija spremila o igraču. */
async function storedPlayer(page: Page): Promise<{ id: string; nickname: string } | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('orbis:v1');
    if (!raw) return null;
    return (JSON.parse(raw) as { player: { id: string; nickname: string } | null }).player;
  });
}

test('gumb za prijavu stoji na ulazu, ispod nadimka', async ({ page }) => {
  await signOut(page);
  await stubGoogle(page);
  await stubApi(page);
  await page.goto('/');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  // Nadimak ostaje prvi; prijava je ponuda, ne uvjet.
  await expect(dialog.getByLabel('Nadimak')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Nastavi s Googleom' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Preskoči/ })).toBeVisible();
});

test('prijava šalje token i pamti igrača', async ({ page }) => {
  await signOut(page);
  await stubGoogle(page);
  const seen = await stubApi(page);
  await page.goto('/');

  const button = page.getByRole('button', { name: 'Nastavi s Googleom' });
  await expect(button).toBeVisible(SLOW);
  await button.click();

  // Modal se zatvori jer je igrač sada poznat.
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });

  expect(seen).toHaveLength(1);
  expect(seen[0]?.credential).toBe(CREDENTIAL);

  const player = await storedPlayer(page);
  expect(player?.nickname).toBe('Daniel Rajić');
  expect(player?.id).toBe('p-google');
});

test('igrač koji već ima nadimak šalje svoj token, da ga se veže', async ({ page }) => {
  /*
   * Bez zaglavlja bi poslužitelj napravio novog igrača i tiho odvojio čovjeka od
   * njegove lige. Ovo je jedina razlika između vezanja i nove prijave.
   */
  await stubGoogle(page);
  const seen = await stubApi(page, { linked: [] });
  await page.goto('/');

  const liga = page.getByRole('button', { name: 'Liga' });
  await expect(liga).toBeVisible({ timeout: 15_000 });
  await liga.click();

  const button = page.getByRole('button', { name: 'Nastavi s Googleom' });
  await expect(button).toBeVisible(SLOW);
  await button.click();

  await expect.poll(() => seen.length).toBeGreaterThan(0);
  expect(seen[0]?.authorization).toMatch(/^Bearer /);
});

test('vezanom igraču se prijava više ne nudi', async ({ page }) => {
  await stubGoogle(page);
  await stubApi(page, { linked: ['google'] });
  await page.goto('/');

  const liga = page.getByRole('button', { name: 'Liga' });
  await expect(liga).toBeVisible({ timeout: 15_000 });
  await liga.click();

  // Ljestvica se učitala, dakle panel je odradio svoje; gumba nema.
  await expect(page.getByRole('button', { name: 'Napravi ligu' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Nastavi s Googleom' })).toHaveCount(0);
});

test('zamjena igrača se kaže naglas', async ({ page }) => {
  /*
   * Kad je Google račun već vezan uz nekoga drugog, uređaj prelazi na tog igrača.
   * Tiha zamjena bi značila da čovjek gleda tuđu ljestvicu i ne zna zašto.
   */
  await stubGoogle(page);
  await stubApi(page, { linked: [], switched: true });
  await page.goto('/');

  const liga = page.getByRole('button', { name: 'Liga' });
  await expect(liga).toBeVisible(SLOW);
  await liga.click();

  const button = page.getByRole('button', { name: 'Nastavi s Googleom' });
  await expect(button).toBeVisible(SLOW);
  await button.click();

  await expect(page.getByText(/Sad si prijavljen kao Daniel Rajić/)).toBeVisible({
    timeout: 15_000,
  });
});

test('odbijena prijava javi grešku i ne pamti igrača', async ({ page }) => {
  await signOut(page);
  await stubGoogle(page);
  await stubApi(page, { status: 401 });
  await page.goto('/');

  const button = page.getByRole('button', { name: 'Nastavi s Googleom' });
  await expect(button).toBeVisible(SLOW);
  await button.click();

  await expect(page.getByRole('alert')).toBeVisible(SLOW);
  // Modal ostaje: igrač još nije poznat, pa ga se ne smije pustiti dalje kao da jest.
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await storedPlayer(page)).toBeNull();
});

test('igra radi i kad Googleova knjižnica uopće ne dođe', async ({ page }) => {
  /*
   * Skriptu blokiraju proširenja, mreže i načini rada bez trećih strana. Tada
   * gumba jednostavno nema — ni prazan okvir, ni poruka o grešci — a nadimak
   * radi kao i prije.
   */
  await signOut(page);
  await stubApi(page);
  await page.route('https://accounts.google.com/**', (route: Route) => route.abort());
  await page.goto('/');

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Nadimak')).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('alert')).toHaveCount(0);

  await dialog.getByLabel('Nadimak').fill('Daniel');
  await dialog.getByRole('button', { name: 'Kreni' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
});
