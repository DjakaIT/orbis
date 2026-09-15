/**
 * Zatvaranje dospjelih rundi. Zakazana funkcija. SPEC §7.3.
 *
 * Raspored je petkom svaki sat, a sam handler provjerava zagrebački sat: satni
 * raspored s provjerom lokalnog sata otporan je na ljetno i zimsko vrijeme, dok
 * fiksni UTC termin ne bi bio.
 *
 * Runda se ionako zatvara sama čim svi predaju rezultat; ovo pokriva tjedne u
 * kojima netko nije odigrao.
 */

import type { Config } from '@netlify/functions';

import { closeDueRounds } from '../lib/rounds';
import { blobStore } from '../lib/store';

export default async function handler(): Promise<void> {
  const closed = await closeDueRounds(await blobStore());
  if (closed > 0) console.warn(`Zatvoreno rundi: ${String(closed)}`);
}

export const config: Config = {
  schedule: '0 * * * 5',
};
