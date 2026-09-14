import { expect, test } from '@playwright/test';

test('stranica se učita i prikaže wordmark', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Orbis')).toBeVisible();
  await expect(page).toHaveTitle('Orbis');
});
