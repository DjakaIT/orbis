import { expect, test } from '@playwright/test';

test('stranica se učita i prikaže wordmark', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Orbis')).toBeVisible();
  // Naslov nosi i opis zbog rezultata pretrage i taba; wordmark ostaje samo „Orbis".
  await expect(page).toHaveTitle(/^Orbis — /);
});

test('fokus je vidljiv tipkovnicom', async ({ page }) => {
  // SPEC §11.3 t. 8. Provjerava se stvarni izračunati stil, ne postojanje pravila.
  await page.goto('/');
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });

  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
  });

  expect(outline).not.toBeNull();
  expect(outline?.style).not.toBe('none');
  expect(parseFloat(outline?.width ?? '0')).toBeGreaterThanOrEqual(2);
});

test('udaljenost se objavljuje čitaču ekrana', async ({ page }) => {
  // Boja je informacija, ali ne smije biti jedina — SPEC §11.3 t. 8.
  await page.goto('/');
  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  const live = page.getByRole('status').filter({ hasText: 'km' });
  await expect(live).toHaveCount(0);

  await input.fill('Brazil');
  await input.press('Enter');

  await expect(live).toBeVisible();
  await expect(live).toHaveAttribute('aria-live', 'polite');
});
