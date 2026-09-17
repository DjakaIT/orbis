import { expect, test } from './fixtures';

test('odigra se partija i stanje preživi refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');

  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  /*
   * Globus mora doista zauzeti prostor — heroj je, ne ukras. SPEC §2.4.
   *
   * Vlastiti rok, ne zadanih 5 s: globus je namjerno lazy chunk sa three.js-om,
   * pa stize nakon polja za unos. Pod punim paralelizmom to zna proci 5 s, a da
   * s aplikacijom nije nista.
   */
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  const rows = page.getByRole('listitem');

  await input.fill('Brazil');
  await input.press('Enter');
  await expect(rows.filter({ hasText: 'Brazil' })).toHaveCount(1);

  await input.fill('Japan');
  await input.press('Enter');
  await expect(rows).toHaveCount(2);

  // Udaljenost se objavljuje i čitaču ekrana, ne samo bojom. SPEC §11.3 t. 8.
  await expect(page.getByRole('status').filter({ hasText: 'km' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(2, { timeout: 15_000 });

  expect(errors).toEqual([]);
});

test('neprepoznato ime ne troši pokušaj', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await input.fill('Xyzzy');
  await input.press('Enter');

  await expect(page.getByText(/Ne prepoznajem/)).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});
