import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm dev --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    /*
     * Drugi server posluzuje `dist/`, za `pwa.spec.ts`: service worker, offline
     * i manifest u razvoju ne postoje. Trazi da je `pnpm build` vec prosao.
     */
    {
      command: 'pnpm preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
