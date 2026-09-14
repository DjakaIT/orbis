/**
 * Hrvatski podaci. Učitavaju se **tek kad se mod odabere** — SPEC §10, faza 2.
 *
 * Zaseban modul, ne dio `load.ts`, upravo zato: `import()` iz `GameContext`
 * odvaja i ovaj kod i `d3-geo` u vlastiti chunk.
 */

import { buildIndex, type SearchIndex } from '../engine/search';
import type { HrGeometry } from '../render/mapHR';
import type { Place, Tier } from '../types';
import type { Aliases } from './load';

export interface HrData {
  places: Place[];
  tier: Tier;
  geometry: HrGeometry;
  index: SearchIndex;
}

interface HrPlacesFile {
  gradovi: Place[];
  mjesta: Place[];
}

const cache = new Map<Tier, HrData>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Ne mogu učitati ${path}: HTTP ${String(res.status)}`);
  return (await res.json()) as T;
}

export async function loadHr(tier: Tier): Promise<HrData> {
  const hit = cache.get(tier);
  if (hit) return hit;

  const [places, geometry, aliases] = await Promise.all([
    getJson<HrPlacesFile>('/data/hr-places.json'),
    getJson<HrGeometry>('/data/hr-outline.json'),
    getJson<Aliases>('/data/aliases.json'),
  ]);

  const list = places[tier];
  const data: HrData = {
    places: list,
    tier,
    geometry,
    index: buildIndex(list, aliases.hr),
  };

  cache.set(tier, data);
  return data;
}
