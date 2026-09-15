import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { dailyTarget } from '../../src/engine/seed';
import { zagrebDate } from '../../src/engine/time';

/**
 * Pogodak i ono što se uz njega vidi.
 *
 * Meta se izvodi iz istog determinističkog izvora kao u aplikaciji, pa test ne
 * pogađa nego zna odgovor.
 */
async function targetName(): Promise<string> {
  const meta = JSON.parse(await readFile('public/data/world-meta.json', 'utf8')) as {
    n: number;
    countries: { name: string }[];
  };
  const name = meta.countries[dailyTarget(zagrebDate(), 'world', meta.n)]?.name;
  if (!name) throw new Error('meta dana nije nadena');
  return name;
}

test('pogodak otvara karticu s imenom, zastavom i brojem pokušaja', async ({ page }) => {
  const target = await targetName();
  await page.goto('/');

  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  // Prije pogotka kartice nema — inače bi odgovor stajao na ekranu od početka.
  await expect(page.getByRole('region', { name: 'Rezultat' })).toHaveCount(0);

  await input.fill('Brazil');
  await input.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Rezultat' })).toHaveCount(0);

  await input.fill(target);
  await input.press('Enter');

  const card = page.getByRole('region', { name: 'Rezultat' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(target);
  await expect(card).toContainText('Pogodak iz 2 pokušaja');
  await expect(card.getByRole('button', { name: 'Podijeli' })).toBeVisible();
});

test('zastave su slike, ne dva slova', async ({ page }) => {
  /*
   * Emoji zastava se na Windowsu ne prikazuje — ondje nijedan sistemski rez nema
   * te glifove, pa Chrome ispise gola dva slova. Zato idu prave slike.
   */
  await page.goto('/');
  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await input.fill('Njemačka');
  await input.press('Enter');

  const flag = page.getByRole('listitem').first().locator('img');
  await expect(flag).toBeVisible();
  await expect(flag).toHaveAttribute('src', '/flags/de.svg');

  // Slika se mora stvarno ucitati, ne samo postojati u DOM-u.
  const loaded = await flag.evaluate(
    (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
  );
  expect(loaded).toBe(true);

  // Prazan `alt`: ime drzave stoji odmah do zastave i citac bi ga citao dvaput.
  await expect(flag).toHaveAttribute('alt', '');
});

test('pokušaj pokazuje koliko je blizu, ne samo kilometre', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await input.fill('Brazil');
  await input.press('Enter');

  const status = page.getByRole('status').filter({ hasText: 'km' });
  await expect(status).toContainText('% blizu');
});
