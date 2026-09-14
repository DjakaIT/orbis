import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { dailyTarget } from '../../src/engine/seed';
import { zagrebDate } from '../../src/engine/time';

/**
 * Kriterij iz SPEC §10, faza 3: dva preglednika kreiraju ligu, pridruže se,
 * odigraju i vide ispravnu ljestvicu.
 *
 * Traži pokrenut worker na :8787 (`pnpm -C worker dev`). Ako ga nema, test se
 * preskače umjesto da padne — backend ima vlastitu provjeru u `worker/`.
 */

const API = 'http://localhost:8787/api';

test.beforeAll(async () => {
  const alive = await fetch(`${API}/health`)
    .then((r) => r.ok)
    .catch(() => false);
  test.skip(!alive, 'Worker nije pokrenut na :8787');
});

/** Otvara panel lige i upisuje nadimak. */
async function signUp(page: Page, nickname: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Liga' }).click();
  const field = page.getByLabel('Nadimak');
  await expect(field).toBeVisible();
  await field.fill(nickname);
  await page.getByRole('button', { name: 'Uđi' }).click();
}

test('dva igrača dijele ligu i vide ispravnu ljestvicu', async ({ browser }) => {
  const suffix = Date.now().toString(36).slice(-4);

  // Dva odvojena konteksta = dva odvojena localStoragea, kao dva preglednika.
  const one = await browser.newContext();
  const two = await browser.newContext();
  const daniel = await one.newPage();
  const marta = await two.newPage();

  await signUp(daniel, `Daniel-${suffix}`);

  // Link za povrat pokazuje se jednom, odmah nakon prijave. SPEC §7.2.
  await expect(daniel.getByText(/Spremi ovaj link/)).toBeVisible();

  await daniel.getByLabel('Ime lige').fill(`Ekipa-${suffix}`);
  await daniel.getByRole('button', { name: 'Otvori' }).click();

  await expect(daniel.getByText(`Ekipa-${suffix}`)).toBeVisible({ timeout: 15_000 });
  const code = (await daniel.getByText(/^[A-HJ-NP-Z2-9]{6}$/).innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  await signUp(marta, `Marta-${suffix}`);
  await marta.getByLabel('Kod lige').fill(code);
  await marta.getByRole('button', { name: 'Uđi' }).click();
  await expect(marta.getByText(`Ekipa-${suffix}`)).toBeVisible({ timeout: 15_000 });

  // Obojica su na ljestvici.
  await expect(marta.getByText(`Daniel-${suffix}`)).toBeVisible();
  await expect(marta.getByText(`Marta-${suffix}`)).toBeVisible();

  // Prije nego što itko odigra, tuđi rezultati su zaključani.
  await expect(marta.getByText(/otključavaju se kad sam odigraš/)).toBeVisible();

  await one.close();
  await two.close();
});

test('pogodak se sam preda ligi', async ({ page, context }) => {
  const suffix = Date.now().toString(36).slice(-4);

  await signUp(page, `Solo-${suffix}`);
  await page.getByLabel('Ime lige').fill(`Sam-${suffix}`);
  await page.getByRole('button', { name: 'Otvori' }).click();
  await expect(page.getByText(`Sam-${suffix}`)).toBeVisible({ timeout: 15_000 });

  // Ljestvica prije igranja: nula bodova, kvačice nema.
  const row = page.getByRole('listitem').filter({ hasText: `Solo-${suffix}` });
  await expect(row).toContainText('⋯');

  // Meta se izvodi iz istog determinističkog izvora kao u aplikaciji, pa test
  // ne pogađa nego zna odgovor.
  const meta = JSON.parse(await readFile('public/data/world-meta.json', 'utf8')) as {
    countries: { name: string }[];
  };
  const target = meta.countries[dailyTarget(zagrebDate(), 'world', meta.countries.length)];
  expect(target, 'meta mora postojati').toBeDefined();

  const input = page.getByLabel('Upiši državu');
  await input.fill('Brazil');
  await input.press('Enter');
  await expect(page.getByRole('listitem').filter({ hasText: 'Brazil' })).toHaveCount(1);

  await input.fill(target?.name ?? '');
  await input.press('Enter');
  await expect(page.getByPlaceholder('Pogodak')).toBeVisible();

  // Predaja je automatska — kvačica se pojavi bez ijednog klika. SPEC §10.
  await expect(row).toContainText('✓', { timeout: 15_000 });

  await context.close();
});
