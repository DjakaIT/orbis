import { expect, test } from '@playwright/test';

import { PREVIEW_URL } from '../../playwright.config';

/**
 * Što igrač vidi kad API lige nije spojen.
 *
 * Ovo je test koji je nedostajao. Produkcijski build zove `/api` na istom
 * originu, a proxy prema Workeru nije bio podešen — pa je prijava slala nadimak
 * i dobivala natrag 404 stranicu hostinga. Igraču je pisalo doslovno „HTTP 404".
 *
 * Vozi se na `vite preview`, koji nema `/api` rutu — dakle na točno onim uvjetima
 * pod kojima je bug i nastao. Nema `skip`: ovaj test se uvijek izvršava, jer je
 * upravo tihi `skip` u testovima lige značio da je paket bio zelen.
 */

test('prijava u ligu bez API-ja ne pokazuje „HTTP 404"', async ({ page }) => {
  await page.goto(PREVIEW_URL);
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Liga' }).click();
  const nickname = page.getByLabel('Nadimak');
  await expect(nickname).toBeVisible();
  await nickname.fill('Daniel');
  await page.getByRole('button', { name: 'Uđi' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });

  // Ono što je igrač prijavio: gola HTTP brojka bez ijedne uputе.
  await expect(alert).not.toContainText('HTTP 404');
  await expect(alert).not.toContainText('404');

  // Ono što mora pisati: da liga ne radi, ali da igra radi.
  await expect(alert).toContainText('Liga');
  await expect(alert).toContainText('Igra radi');
});

test('igra ostaje potpuno upotrebljiva dok liga ne radi', async ({ page }) => {
  // Liga je neobavezna. Pad lige ne smije povući igru sa sobom.
  await page.goto(PREVIEW_URL);

  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Liga' }).click();
  const nickname = page.getByLabel('Nadimak');
  await nickname.fill('Daniel');
  await page.getByRole('button', { name: 'Uđi' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });

  await input.fill('Brazil');
  await input.press('Enter');
  await expect(page.getByRole('listitem').filter({ hasText: 'Brazil' })).toHaveCount(1);
});

test('nadimak se šalje kao JSON, a ne kao navigacija obrasca', async ({ page }) => {
  /*
   * Prijavljeno je „u payloadu šalje ime". Provjera da je to stvarno POST s JSON
   * tijelom — obrazac koji se submitta navigacijom izgledao bi slično, a bio bi
   * posve drugi bug.
   */
  const sent: { method: string; body: string | null }[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/players')) sent.push({ method: r.method(), body: r.postData() });
  });

  await page.goto(PREVIEW_URL);
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Liga' }).click();
  await page.getByLabel('Nadimak').fill('Daniel');
  await page.getByRole('button', { name: 'Uđi' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });

  expect(sent).toHaveLength(1);
  expect(sent[0]?.method).toBe('POST');
  expect(JSON.parse(sent[0]?.body ?? '{}')).toEqual({ nickname: 'Daniel' });

  // Stranica se nije nikamo pomaknula — obrazac je zaustavio svoj submit.
  expect(new URL(page.url()).pathname).toBe('/');
});
