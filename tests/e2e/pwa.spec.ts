import { expect, test, type Page } from '@playwright/test';

/**
 * PWA iz faze 4. Jedini test koji se vozi na **produkcijskom** buildu preko
 * `vite preview` — service worker u razvoju ne postoji, pa bi sve ovo na dev
 * serveru prošlo bez ijedne provjere.
 *
 * Traži `pnpm build` prije `pnpm e2e`; preview server podiže playwright.config.ts.
 */

const PREVIEW = 'http://localhost:4173';

/** Čeka da service worker preuzme stranicu — tek tada offline ima smisla. */
async function serviceWorkerReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active?.state !== 'activated') {
      await new Promise<void>((resolve) => {
        registration.active?.addEventListener('statechange', () => {
          resolve();
        });
      });
    }
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          resolve();
        });
      });
    }
  });
}

test('manifest je dohvatljiv i opisuje instalabilnu aplikaciju', async ({ page }) => {
  await page.goto(PREVIEW);

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const response = await page.request.get(new URL(href ?? '', PREVIEW).href);
  expect(response.status()).toBe(200);

  const manifest = (await response.json()) as {
    name: string;
    display: string;
    icons: { src: string; sizes: string }[];
  };
  expect(manifest.name).toBe('Orbis');
  expect(manifest.display).toBe('standalone');

  // Svaka ikona iz manifesta mora se stvarno posluživati, inače instalacija pada.
  for (const icon of manifest.icons) {
    const icoRes = await page.request.get(new URL(icon.src, PREVIEW).href);
    expect(icoRes.status(), icon.src).toBe(200);
    expect(icoRes.headers()['content-type']).toContain('image/png');
  }
});

test('OG slika se poslužuje na adresi iz meta tagova', async ({ page }) => {
  await page.goto(PREVIEW);

  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  const response = await page.request.get(new URL(og ?? '', PREVIEW).href);
  expect(response.status()).toBe(200);
  expect((await response.body()).byteLength).toBeGreaterThan(1000);
});

test('igra se otvara i igra bez mreže nakon prvog posjeta', async ({ page, context }) => {
  await page.goto(PREVIEW);
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 20_000 });
  await serviceWorkerReady(page);

  await context.setOffline(true);
  await page.reload();

  // Ljuska, podaci i pretraga rade iz precachea — SPEC §10, faza 4.
  const input = page.getByLabel('Upiši državu');
  await expect(input).toBeEnabled({ timeout: 20_000 });

  await input.fill('Brazil');
  await input.press('Enter');
  await expect(page.getByRole('listitem').filter({ hasText: 'Brazil' })).toHaveCount(1);

  await context.setOffline(false);
});

test('deep link lige se offline vraća na ljusku, ne na 404', async ({ page, context }) => {
  await page.goto(PREVIEW);
  await serviceWorkerReady(page);

  await context.setOffline(true);
  // `/l/:code` je klijentska ruta; bez navigateFallbacka ovo bi bila mrežna greška.
  await page.goto(`${PREVIEW}/l/ABCDEF`);
  await expect(page.getByText('Orbis')).toBeVisible({ timeout: 20_000 });

  await context.setOffline(false);
});

test('service worker ne povlači HR podatke u pozadini', async ({ page }) => {
  // Kriterij faze 2 vrijedi i kad SW radi: HR podaci se dohvaćaju tek pri odabiru
  // moda. Dev server to ne bi pokazao jer ondje service workera nema.
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto(PREVIEW);
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 20_000 });
  await serviceWorkerReady(page);

  expect(requests.filter((u) => u.includes('/data/hr-'))).toEqual([]);

  await page.getByRole('tab', { name: 'Hrvatska' }).click();
  await expect(page.getByLabel('Upiši naselje')).toBeEnabled({ timeout: 20_000 });
  await expect
    .poll(() => requests.filter((u) => u.includes('/data/hr-')).length)
    .toBeGreaterThan(0);
});
