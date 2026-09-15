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
import { blobStore } from '../lib/store';

/** Aplikacija i spremište se grade jednom po instanci, ne po zahtjevu. */
let app: ReturnType<typeof createApp> | null = null;

export default async function handler(request: Request, _context: Context): Promise<Response> {
  app ??= createApp(await blobStore());
  return app.fetch(request);
}

export const config: Config = {
  path: '/api/*',
};
