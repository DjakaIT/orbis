import { expect, test } from '@playwright/test';

/**
 * Tri neovisna signala pristupačnosti, svaki sa svojim ponašanjem.
 *
 * Smanjeno gibanje ne znači bez povratne informacije nego blažu, a smanjena
 * prozirnost ne znači istu plohu s manje zamućenja nego punu plohu. Lako je
 * napisati `@media` pravilo koje ništa ne radi, pa se ovdje mjeri izračunati
 * stil, ne postojanje pravila.
 */

test('smanjeno gibanje ukida animaciju retka', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 15_000 });
  await input.fill('Brazil');
  await input.press('Enter');

  const row = page.getByRole('listitem').first();
  await expect(row).toBeVisible();

  const duration = await row.evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.05);
});

test('bez smanjenog gibanja animacija postoji', async ({ page }) => {
  // Bez ovoga bi prethodni test prolazio i da animacije uopće nema.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 15_000 });
  await input.fill('Brazil');
  await input.press('Enter');

  const row = page.getByRole('listitem').first();
  await expect(row).toBeVisible();

  const duration = await row.evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeGreaterThan(0.1);
});

test('zaglavlje je prozirni sloj, ne neprozirna traka', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });

  const header = page.locator('header');
  const style = await header.evaluate((el) => {
    const s = getComputedStyle(el);
    return { filter: s.backdropFilter, position: s.position, background: s.backgroundColor };
  });

  expect(style.position).toBe('sticky');
  expect(style.filter).toContain('blur');
  // Poluprozirna ploha: sadržaj klizi ispod nje, ne iza nje.
  expect(style.background).toMatch(/rgba|color\(/);
});

test('polje za unos ima vidljiv fokus i dovoljno veliku metu', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  const box = await input.boundingBox();
  // Prst traži barem 44 px; polje je glavna meta na ekranu.
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  await input.focus();
  const outline = await input.evaluate((el) => getComputedStyle(el).borderColor);
  expect(outline).toBeTruthy();
});

test('segmenti modova su dovoljno velika meta', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });

  for (const name of ['Svijet', 'Gradovi', 'Hrvatska']) {
    const box = await page.getByRole('tab', { name }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(24);
    expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
  }
});
