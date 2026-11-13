/**
 * Glavni gradovi. Učitavaju se tek kad se mod odabere, kao i hrvatski podaci.
 *
 * Uz bazen ide i geometrija granica iz `load.ts` — globus se crta isto kao u
 * modu svijet, samo se boji država kojoj pogođeni grad pripada. Zato je `code`
 * kod države, ne šifra grada: Pretoria, Bloemfontein i Cape Town nose isti kod,
 * i svaki od njih je pogodak kad je meta Južnoafrička Republika.
 */

import type { Pool } from '../engine/seed';
import { buildIndex, type SearchIndex } from '../engine/search';
import type { Place } from '../types';
import { getJson } from './files';
import { loadWorld } from './load';

export interface CapitalsData {
  places: Place[];
  /** Granice po kodu — iste kao u modu svijet, dijeli se cache. */
  shapes: Map<string, GeoJSON.Geometry>;
  index: SearchIndex;
  pools: Pool[];
  legacy: number[];
}

interface CapitalsFile {
  n: number;
  capitals: {
    id: number;
    code: string;
    a2?: string;
    name: string;
    country: string;
    lat: number;
    lon: number;
  }[];
  pools: Pool[];
  legacy: number[];
  /** Engleski i stari oblici imena → prikazno ime: „Nur-Sultan" → Astana. */
  aliases: Record<string, string>;
}

let promise: Promise<CapitalsData> | null = null;

export function loadCapitals(): Promise<CapitalsData> {
  promise ??= fetchCapitals();
  return promise;
}

async function fetchCapitals(): Promise<CapitalsData> {
  const [file, world] = await Promise.all([getJson<CapitalsFile>('capitals.json'), loadWorld()]);

  const places: Place[] = file.capitals.map((c) => ({
    id: c.id,
    code: c.code,
    // Grad nosi zastavu svoje drzave — to je jedina zastava koju grad ima.
    a2: c.a2 ?? '',
    name: c.name,
    lat: c.lat,
    lon: c.lon,
  }));

  return {
    places,
    shapes: world.shapes,
    index: buildIndex(places, file.aliases),
    pools: file.pools,
    legacy: file.legacy,
  };
}
