import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Zum globusa. SPEC §6.1 ga je zabranjivao, ali sitne države se bez njega ne mogu
 * pogledati — a upravo je to bio razlog zbog kojeg su se crtale kao mrlje.
 *
 * Mjeri se kroz `__orbisZoom`, koji `Globe.tsx` postavlja upravo za ovo: stanje
 * scene je imperativno i ne postoji nigdje u DOM-u.
 */

async function zoom(page: Page): Promise<number> {
  return page.evaluate(() => (window as { __orbisZoom?: number }).__orbisZoom ?? 0);
}

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 20_000 });
  await expect.poll(() => zoom(page), { timeout: 15_000 }).toBeGreaterThan(0);
}

test('kotačić približava i udaljava', async ({ page }) => {
  await ready(page);
  expect(await zoom(page)).toBeCloseTo(1, 5);

  const canvas = page.locator('canvas').first();
  await canvas.hover();

  await page.mouse.wheel(0, -600);
  await expect.poll(() => zoom(page)).toBeGreaterThan(1.5);

  await page.mouse.wheel(0, 1200);
  await expect.poll(() => zoom(page)).toBeCloseTo(1, 1);
});

test('zum ne izlazi iz raspona', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('canvas').first();
  await canvas.hover();

  // Koraci su obični, kakve kotačić i šalje — Chromium sintetičku deltu od
  // dvadeset tisuća ne prosljeđuje cijelu, pa bi jedan golemi zamah lagao.
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -500);
  await expect.poll(() => zoom(page)).toBeCloseTo(4, 5);

  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 500);
  // Ispod jedinice kugla bi otplutala u daljinu i ostavila prazan papir.
  await expect.poll(() => zoom(page)).toBeCloseTo(1, 5);
});

test('stranica se ne pomiče dok se zumira nad globusom', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('canvas').first();
  await canvas.hover();

  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(150);

  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('promjena veličine prozora zadržava zum', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('canvas').first();
  await canvas.hover();
  await page.mouse.wheel(0, -900);
  await expect.poll(() => zoom(page)).toBeGreaterThan(1.5);

  const zoomed = await zoom(page);
  await page.setViewportSize({ width: 800, height: 700 });
  await page.waitForTimeout(300);

  expect(await zoom(page)).toBeCloseTo(zoomed, 5);
});
