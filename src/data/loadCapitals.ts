/**
 * Glavni gradovi. Učitavaju se tek kad se mod odabere, kao i hrvatski podaci.
 *
 * Bazen je 4,8 KB gzipano, ali uz njega ide i geometrija granica iz `load.ts` —
 * globus se crta isto kao u modu svijet, samo se boji država kojoj pogođeni grad
 * pripada. Zato je `code` ISO kod države, ne šifra grada.
 */

import { buildIndex, type SearchIndex } from '../engine/search';
import type { Place } from '../types';
import { loadWorld } from './load';

export interface CapitalsData {
  places: Place[];
  /** Granice po ISO3 — iste kao u modu svijet, dijeli se cache. */
  shapes: Map<string, GeoJSON.Geometry>;
  index: SearchIndex;
}

interface CapitalsFile {
  n: number;
  capitals: { id: number; code: string; name: string; country: string; lat: number; lon: number }[];
}

let promise: Promise<CapitalsData> | null = null;

export function loadCapitals(): Promise<CapitalsData> {
  promise ??= fetchCapitals();
  return promise;
}

async function fetchCapitals(): Promise<CapitalsData> {
  const [file, world] = await Promise.all([
    fetch('/data/capitals.json').then(async (r) => {
      if (!r.ok) throw new Error(`Ne mogu učitati glavne gradove: HTTP ${String(r.status)}`);
      return (await r.json()) as CapitalsFile;
    }),
    loadWorld(),
  ]);

  const places: Place[] = file.capitals.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    lat: c.lat,
    lon: c.lon,
  }));

  return {
    places,
    shapes: world.shapes,
    // Gradovi nemaju aliase: imena dolaze iz CLDR-a i nemaju ustaljene inacice.
    index: buildIndex(places, {}),
  };
}
