import { describe, expect, it } from 'vitest';

import { shareImageUrl, siteUrl } from '../../vite.config';

/**
 * Adresa OG slike. Open Graph trazi apsolutni URL, a domena se ne zna dok se ne
 * gradi — Netlify je daje kroz okolinu. Kriva adresa se ne vidi nigdje osim u
 * tudjem chatu, kao preview bez slike, pa je jedino mjesto gdje se moze uhvatiti
 * ovdje.
 */
describe('shareImageUrl', () => {
  it('uzima produkcijsku domenu kad je ima', () => {
    expect(shareImageUrl({ URL: 'https://orbis.hr' })).toBe('https://orbis.hr/og.png');
  });

  it('deploy preview pokazuje na samog sebe', () => {
    // Inace bi svaki preview dijelio sliku s produkcije i ne bi se vidjela izmjena.
    const env = { DEPLOY_PRIME_URL: 'https://deploy-preview-7--orbis.netlify.app' };
    expect(shareImageUrl(env)).toBe('https://deploy-preview-7--orbis.netlify.app/og.png');
  });

  it('produkcijska domena ima prednost pred preview domenom', () => {
    const env = { URL: 'https://orbis.hr', DEPLOY_PRIME_URL: 'https://preview.netlify.app' };
    expect(shareImageUrl(env)).toBe('https://orbis.hr/og.png');
  });

  it('prihvaca i rucno zadan VITE_SITE_URL', () => {
    expect(shareImageUrl({ VITE_SITE_URL: 'https://orbis.hr' })).toBe('https://orbis.hr/og.png');
  });

  it('ne pravi dvostruku kosu crtu', () => {
    expect(shareImageUrl({ URL: 'https://orbis.hr/' })).toBe('https://orbis.hr/og.png');
    expect(shareImageUrl({ URL: 'https://orbis.hr///' })).toBe('https://orbis.hr/og.png');
  });

  it('bez domene ostaje root-relativan, a ne izmisljen', () => {
    // Lokalni build i `pnpm preview` nemaju domenu. Root-relativna adresa je
    // ispravna za preglednik; vecina scrapera je razrijesi, X ne — ali izmisljena
    // domena bi bila kriva svugdje.
    expect(shareImageUrl({})).toBe('/og.png');
  });
});

describe('siteUrl', () => {
  it('bez ijedne varijable vraca null, ne prazan niz', () => {
    // null je signal da se og:url i kanonski link uopce ne ispisuju — prazan
    // `href` bi pokazivao na trenutnu stranicu i bio bi tiho kriv.
    expect(siteUrl({})).toBeNull();
  });

  it('skida zavrsnu kosu crtu', () => {
    expect(siteUrl({ URL: 'https://orbis.hr/' })).toBe('https://orbis.hr');
  });
});
