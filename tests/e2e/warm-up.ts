import { chromium } from '@playwright/test';

import { signIn } from './fixtures';

import { DEV_URL, PREVIEW_URL } from '../../playwright.config';

/**
 * Otvori oba servera jednom prije svih testova.
 *
 * Playwright čeka da server odgovori na `/`, ali Vite tada još nije transformirao
 * modul graf ni optimizirao ovisnosti — to radi tek prvo stvarno učitavanje. Kad
 * deset workera krene odjednom na hladan server, prvi od njih čekaju taj posao i
 * znaju probiti 30 s, najčešće odmah nakon `pnpm build`.
 *
 * Jedno učitavanje unaprijed to skine s puta, bez retryja koji bi isti problem
 * samo sakrio.
 */
export default async function warmUp(): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const url of [DEV_URL, PREVIEW_URL]) {
      const page = await browser.newPage();
      try {
        // Modal na ulazu inace stoji preko polja koje se ceka.
        await signIn(page);
        await page.goto(url, { timeout: 60_000 });
        // Polje je omogućeno tek kad su podaci učitani — tada je server topao.
        await page.getByLabel('Upiši državu').waitFor({ state: 'visible', timeout: 60_000 });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
