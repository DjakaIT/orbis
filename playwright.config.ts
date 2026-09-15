import { defineConfig, devices } from '@playwright/test';

/** Dev server: sve osim PWA-a. */
export const DEV_URL = 'http://localhost:5173';

/**
 * Produkcijski build kroz `vite preview`, za `pwa.spec.ts`: service worker,
 * offline i manifest u razvoju ne postoje. Traži da je `pnpm build` već prošao.
 */
export const PREVIEW_URL = 'http://localhost:4173';

export default defineConfig({
  testDir: './tests/e2e',
  // `warm-up.ts` nije spec nego priprema; bez ovoga bi ga `testDir` pokupio kao
  // datoteku bez ijednog testa.
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/warm-up.ts',
  fullyParallel: true,
  /*
   * WebGL nije neogranicen resurs. Svaka stranica otvara kontekst, a preglednik
   * ih drzi ogranicen broj po procesu; deset paralelnih globusa na jednom stroju
   * ne odgovara nicemu stvarnom i tjera testove u rokove. CI ionako ima manje
   * jezgri, pa ondje ostaje zadano.
   */
  // Spread, ne `undefined`: uz `exactOptionalPropertyTypes` izostavljeno polje i
  // polje postavljeno na `undefined` nisu ista stvar.
  ...(process.env.CI ? {} : { workers: 4 }),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: DEV_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm dev --port 5173',
      url: DEV_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm preview --port 4173 --strictPort',
      url: PREVIEW_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
