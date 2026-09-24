/**
 * Ulaz API-ja lige. Netlify funkcija, cijela `/api/*` grana.
 *
 * `config.path` znači da nikakav redirect nije potreban: funkcija je na istom
 * originu kao i stranica, pa nema ni CORS-a ni proxyja. Prije je API živio na
 * Cloudflare Workeru, a pravilo koje ga je spajalo bilo je zakomentirano — i to
 * je bio 404 na prijavi u ligu.
 */

import type { Config, Context } from '@netlify/functions';

import { createApp } from '../lib/app';
import { googleVerifier } from '../lib/google';
import { blobStore } from '../lib/store';

/** Aplikacija i spremište se grade jednom po instanci, ne po zahtjevu. */
let app: ReturnType<typeof createApp> | null = null;

export default async function handler(request: Request, _context: Context): Promise<Response> {
  /*
   * Bez `GOOGLE_CLIENT_ID` prijava Googleom javi da nije podešena, a sve ostalo
   * radi. Varijabla nije tajna — isti client ID stoji i u stranici — ali ovdje
   * mora biti jer se `aud` provjerava na poslužitelju.
   */
  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  app ??= createApp(await blobStore(), {
    ...(clientId ? { verifyGoogle: googleVerifier(clientId) } : {}),
  });
  return app.fetch(request);
}

export const config: Config = {
  path: '/api/*',
};
