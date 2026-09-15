import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Isporuka lige.
 *
 * Ovo je rupa kroz koju je prošao bug: klijent je u produkciji zvao `/api`, a
 * pravilo koje je to spajalo s Cloudflare Workerom stajalo je **zakomentirano**
 * u `netlify.toml`, s placeholderom umjesto adrese. Ništa nije puklo u buildu ni
 * u testovima — zahtjev je išao hostingu, koji je vratio svoju 404 stranicu.
 *
 * API je sada Netlifyjeva funkcija koja sama deklarira svoju putanju, pa spoja
 * koji se može zaboraviti više nema. Ovi testovi čuvaju upravo to: da klijent,
 * funkcija i `netlify.toml` govore istu stvar, bez mreže i bez deploya.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const DIST = join(ROOT, 'dist');

const client = readFileSync(join(ROOT, 'src', 'league', 'client.ts'), 'utf8');
const netlify = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
const fn = readFileSync(join(ROOT, 'netlify', 'functions', 'api.mts'), 'utf8');
const cron = readFileSync(join(ROOT, 'netlify', 'functions', 'close-rounds.mts'), 'utf8');

/** Redci `netlify.toml` bez komentara — samo ono što stvarno vrijedi. */
const active = netlify
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');

describe('adresa API-ja', () => {
  it('klijent zove isti origin', () => {
    expect(client).toContain("'/api'");
  });

  it('funkcija poslužuje točno tu putanju', () => {
    /*
     * Ovo je par koji se prije razišao. Funkcija sama kaže gdje živi, pa ako se
     * jedna strana promijeni bez druge, test pada odmah.
     */
    expect(fn).toMatch(/path:\s*'\/api\/\*'/);
  });

  it('nema proxyja koji bi se mogao zaboraviti', () => {
    // Prethodna arhitektura je za ovo trebala redirect s upisanom adresom.
    expect(active).not.toContain('/api/*');
    expect(client).not.toContain('workers.dev');
    expect(active).not.toContain('workers.dev');
  });

  it('nijedna adresa API-ja se ne upisuje rukom', () => {
    // Funkcija je na istom originu; nema varijable koja bi mogla ostati prazna.
    expect(netlify).not.toContain('ORBIS_API_URL');
    expect(client).not.toContain('http://');
  });
});

describe('netlify.toml', () => {
  it('vraća deep linkove lige na ljusku', () => {
    // `/l/:code` i `/v/:token` su klijentske rute; bez ovoga su 404 prije starta.
    expect(active).toMatch(/from\s*=\s*"\/l\/\*"/);
    expect(active).toMatch(/from\s*=\s*"\/v\/\*"/);
  });

  it('pokazuje na direktorij funkcija', () => {
    expect(active).toMatch(/functions\s*=\s*"netlify\/functions"/);
  });
});

describe('zakazano zatvaranje runde', () => {
  it('vrti se petkom svaki sat, ne jednom u fiksni termin', () => {
    /*
     * Satni raspored s provjerom zagrebačkog sata otporan je na ljetno i zimsko
     * vrijeme; fiksni UTC termin ne bi bio. SPEC §7.3.
     */
    expect(cron).toMatch(/schedule:\s*'0 \* \* \* 5'/);
  });
});

describe('izlaz builda', () => {
  const built = existsSync(join(DIST, 'index.html'));

  it.skipIf(!built)('_headers je ondje', () => {
    expect(existsSync(join(DIST, '_headers'))).toBe(true);
  });

  it.skipIf(!built)('ne emitira se nikakav `_redirects` za API', () => {
    // Ako se ovo pojavi, netko je vratio proxy koji više ne treba.
    const redirects = join(DIST, '_redirects');
    if (!existsSync(redirects)) return;
    expect(readFileSync(redirects, 'utf8')).not.toContain('/api/');
  });
});
