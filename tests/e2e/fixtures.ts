import { test as base, type Page, type Route } from '@playwright/test';

/**
 * Od 2026-09-17 igra na ulazu traži nadimak i dok ga nema stoji modal preko
 * cijele stranice. Testovi koji gledaju ploču, a ne prijavu, zato kreću s već
 * upisanim igračem.
 *
 * Sjeme ide kroz `addInitScript`, dakle prije nego što aplikacija uopće pročita
 * pohranu — `localStorage.setItem` nakon `goto` stigao bi prekasno.
 */
const KEY = 'orbis:v1';

export const PLAYER = {
  id: 'e2e-player',
  token: 'e'.repeat(64),
  nickname: 'E2E',
};

const SEED = JSON.stringify({
  v: 1,
  world: null,
  capitals: null,
  hr: null,
  stats: {},
  player: PLAYER,
  lastLeagueCode: null,
  prefs: { sortBy: 'distance' },
});

export async function signIn(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, seed }: { key: string; seed: string }) => {
      try {
        /*
         * Samo kad pohrane još nema. `addInitScript` se vrti pri svakoj
         * navigaciji, pa i pri `reload()` — bezuvjetan upis bi ondje pregazio
         * partiju koju je igra upravo spremila i testovi preživljavanja stanja
         * bi padali na prazno.
         */
        if (window.localStorage.getItem(key) === null) {
          window.localStorage.setItem(key, seed);
        }
      } catch {
        // Blokirana pohrana: test će pasti na modalu, i to je točan signal.
      }
    },
    { key: KEY, seed: SEED },
  );
}

/** Otvara stranicu bez igrača — za testove same prijave. */
export async function signOut(page: Page): Promise<void> {
  // Brise se jednom, pri prvom ucitavanju: dalje test sam gradi svoje stanje.
  await page.addInitScript((key: string) => {
    try {
      const marker = key + ':e2e-cleared';
      if (window.sessionStorage.getItem(marker) === null) {
        window.sessionStorage.setItem(marker, '1');
        window.localStorage.removeItem(key);
      }
    } catch {
      // Isto.
    }
  }, KEY);
}

/**
 * Nijedan test ne zove Google.
 *
 * Od kad postoji prijava, panel lige pokusa povuci Googleovu knjizniku svaki put
 * kad igrac jos nije vezan. Pustiti to van znaci da cijeli paket ovisi o tudoj
 * mrezi i da svaki pokretanje salje zahtjev trecoj strani. Blokada je ovdje, za
 * sve testove; `google.spec.ts` svoju knjiznicu podmetne prije ucitavanja, pa mu
 * mreza ionako ne treba.
 */
async function blockGoogle(page: Page): Promise<void> {
  await page.route('https://accounts.google.com/**', (route: Route) => route.abort());
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await blockGoogle(page);
    await signIn(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Zatvara modal na ulazu klikom na „Preskoči".
 *
 * Testovi prijave kroz panel lige moraju krenuti bez igrača, a tada modal stoji
 * ispred stranice — isto kao i pravom igraču koji ga preskoči.
 */
export async function skipWelcome(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: /Preskoči/ });
  await skip.waitFor({ state: 'visible', timeout: 15_000 });
  await skip.click();
  await skip.waitFor({ state: 'detached', timeout: 15_000 });
}
