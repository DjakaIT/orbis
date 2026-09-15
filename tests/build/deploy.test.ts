import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { apiUrl } from '../../vite.config';

/**
 * Isporuka lige.
 *
 * Ovo je rupa kroz koju je prosao bug: klijent u produkciji zove `/api`, a
 * `netlify.toml` je pravilo za `/api/*` imao **zakomentirano**. Nista nije puklo
 * u buildu ni u testovima — zahtjev je jednostavno isao na hosting, koji je
 * vratio svoju 404 stranicu.
 *
 * Testovi lige tada su preskakali kad Worker nije pokrenut, pa je zeleni paket
 * govorio da je sve u redu. Ovdje se ne trazi ni Worker ni mreza: provjerava se
 * da su klijent i isporuka **usuglaseni**.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const DIST = join(ROOT, 'dist');

const client = readFileSync(join(ROOT, 'src', 'league', 'client.ts'), 'utf8');
const netlify = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');

describe('adresa API-ja', () => {
  it('klijent u produkciji zove isti origin', () => {
    // Ako se ovo promijeni, promijenilo se i sve ispod — zato stoji ovdje.
    expect(client).toContain("'/api'");
  });

  it('`ORBIS_API_URL` je jedina varijabla koja to spaja', () => {
    expect(apiUrl({})).toBeNull();
    expect(apiUrl({ ORBIS_API_URL: 'https://orbis-api.primjer.workers.dev' })).toBe(
      'https://orbis-api.primjer.workers.dev',
    );
  });

  it('zavrsna kosa crta i visak `/api` se ne udvostrucuju', () => {
    // `/api/*` pravilo dodaje vlastiti `/api`, pa bi oboje dalo `/api/api/...`.
    for (const raw of [
      'https://orbis-api.primjer.workers.dev/',
      'https://orbis-api.primjer.workers.dev/api',
      'https://orbis-api.primjer.workers.dev/api/',
    ]) {
      expect(apiUrl({ ORBIS_API_URL: raw }), raw).toBe('https://orbis-api.primjer.workers.dev');
    }
  });

  it('prazna ili sama bjelina se ne racunaju kao adresa', () => {
    expect(apiUrl({ ORBIS_API_URL: '' })).toBeNull();
    expect(apiUrl({ ORBIS_API_URL: '   ' })).toBeNull();
  });
});

describe('netlify.toml', () => {
  it('vraca deep linkove lige na ljusku', () => {
    // `/l/:code` i `/v/:token` su klijentske rute; bez ovoga su 404 prije starta.
    expect(netlify).toMatch(/from\s*=\s*"\/l\/\*"/);
    expect(netlify).toMatch(/from\s*=\s*"\/v\/\*"/);
  });

  it('ne pokusava sam opisati `/api/*`', () => {
    /*
     * `netlify.toml` ne interpolira varijable okoline, pa bi pravilo ovdje
     * znacilo adresu upisanu rukom — a upravo je takvo pravilo, zakomentirano,
     * i proizvelo bug. Adresa dolazi iz builda, kroz `_redirects`.
     */
    const active = netlify
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(active).not.toContain('/api/*');
  });

  it('uputa kako spojiti ligu stoji u datoteci', () => {
    // Bez ovoga se ne zna gdje se adresa uopce postavlja.
    expect(netlify).toContain('ORBIS_API_URL');
  });
});

describe('izlaz builda', () => {
  const built = existsSync(join(DIST, 'index.html'));
  const redirects = join(DIST, '_redirects');

  it.skipIf(!built)('bez varijable ne emitira prazno ili slomljeno pravilo', () => {
    /*
     * Build bez `ORBIS_API_URL` je ispravan build — samo bez lige. Ono sto ne
     * smije postojati je pravilo koje pokazuje nikamo, jer bi ono vratilo 404 na
     * isti nacin kao i prije, samo tise.
     */
    if (!existsSync(redirects)) return;

    const rule = readFileSync(redirects, 'utf8');
    expect(rule).toMatch(/^\/api\/\*\s+https?:\/\/\S+\/api\/:splat\s+200!$/m);
    expect(rule).not.toContain('undefined');
    expect(rule).not.toContain('<');
  });

  it.skipIf(!built)('_headers je i dalje ondje', () => {
    // `_redirects` i `_headers` zive jedno uz drugo; lako je pregaziti jedno drugim.
    expect(existsSync(join(DIST, '_headers'))).toBe(true);
  });
});
