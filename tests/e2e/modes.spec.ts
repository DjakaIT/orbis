import { expect, test } from '@playwright/test';

test('HR podaci se ne preuzimaju dok se mod ne odabere', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto('/');
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });

  const hrBefore = requests.filter((u) => u.includes('/data/hr-'));
  expect(hrBefore, `HR podaci povučeni prerano: ${hrBefore.join(', ')}`).toEqual([]);

  // Svjetski podaci jesu stigli.
  expect(requests.some((u) => u.includes('world-matrix.bin'))).toBe(true);

  await page.getByRole('tab', { name: 'Hrvatska' }).click();
  await expect(page.getByLabel('Upiši naselje')).toBeEnabled({ timeout: 15_000 });

  await expect
    .poll(() => requests.filter((u) => u.includes('/data/hr-')).length)
    .toBeGreaterThan(0);
});

test('modovi se igraju neovisno', async ({ page }) => {
  await page.goto('/');

  const world = page.getByLabel('Upiši državu');
  await expect(world).toBeEnabled({ timeout: 15_000 });
  await world.fill('Brazil');
  await world.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Hrvatska' }).click();
  const hr = page.getByLabel('Upiši naselje');
  await expect(hr).toBeEnabled({ timeout: 15_000 });

  // Mod Hrvatska kreće od nule — pokušaji iz svijeta ne prelaze.
  await expect(page.getByRole('listitem')).toHaveCount(0);

  await hr.fill('Split');
  await hr.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(1);

  await hr.fill('Osijek');
  await hr.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(2);

  // Povratak u svijet vraća svoju partiju iz pohrane.
  await page.getByRole('tab', { name: 'Svijet' }).click();
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('promjena razine počinje novu partiju', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Hrvatska' }).click();

  const input = page.getByLabel('Upiši naselje');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await input.fill('Split');
  await input.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(1);

  // Druga razina je drugi bazen — indeksi iz prve ondje ne znače ništa.
  await page.getByRole('button', { name: 'Mjesta' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(0);

  // Mjesta imaju šire biralište: naselje koje nije grad sada prolazi.
  await input.fill('Žminj');
  await input.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('glavni gradovi su svoj mod, s vlastitom partijom', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto('/');
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });

  // Bazen gradova se ne dohvaća dok se mod ne odabere — isto pravilo kao za HR.
  expect(requests.filter((u) => u.includes('capitals.json'))).toEqual([]);

  await page.getByRole('tab', { name: 'Gradovi' }).click();
  const input = page.getByLabel('Upiši glavni grad');
  await expect(input).toBeEnabled({ timeout: 15_000 });
  await expect.poll(() => requests.filter((u) => u.includes('capitals.json')).length).toBe(1);

  // Hrvatski egzonim iz CLDR-a, ne „Vienna".
  await input.fill('Beč');
  await input.press('Enter');
  await expect(page.getByRole('listitem').filter({ hasText: 'Beč' })).toHaveCount(1);

  // Država nije valjan unos u ovom modu; meta je grad.
  await input.fill('Austrija');
  await input.press('Enter');
  await expect(page.getByText(/Ne prepoznajem/)).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('sva tri moda drže odvojene partije', async ({ page }) => {
  await page.goto('/');

  const world = page.getByLabel('Upiši državu');
  await expect(world).toBeEnabled({ timeout: 15_000 });
  await world.fill('Brazil');
  await world.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Gradovi' }).click();
  const capitals = page.getByLabel('Upiši glavni grad');
  await expect(capitals).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByRole('listitem')).toHaveCount(0);

  await capitals.fill('Tokio');
  await capitals.press('Enter');
  await capitals.fill('Rim');
  await capitals.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(2);

  await page.getByRole('tab', { name: 'Hrvatska' }).click();
  await expect(page.getByLabel('Upiši naselje')).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByRole('listitem')).toHaveCount(0);

  // Svaki mod zatekne svoju partiju kakvu je ostavio.
  await page.getByRole('tab', { name: 'Gradovi' }).click();
  await expect(page.getByLabel('Upiši glavni grad')).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByRole('listitem')).toHaveCount(2);

  await page.getByRole('tab', { name: 'Svijet' }).click();
  await expect(page.getByLabel('Upiši državu')).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByRole('listitem')).toHaveCount(1);
});
