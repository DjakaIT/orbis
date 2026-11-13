/**
 * Hrvatski podaci. Učitavaju se **tek kad se mod odabere** — SPEC §10, faza 2.
 *
 * Zaseban modul, ne dio `load.ts`, upravo zato: `import()` iz `GameContext`
 * odvaja i ovaj kod i `d3-geo` u vlastiti chunk.
 *
 * Popis za pogađanje je isti u obje razine — sva službena naselja, ~6 700.
 * Razina bira samo bazen meta.
 */

import type { Pool } from '../engine/seed';
import { buildIndex, type SearchIndex } from '../engine/search';
import type { HrGeometry } from '../render/mapHR';
import type { Place, Tier } from '../types';
import { getJson } from './files';
import type { Aliases } from './load';

export interface HrData {
  places: Place[];
  tier: Tier;
  geometry: HrGeometry;
  index: SearchIndex;
  pools: Pool[];
  legacy: number[];
}

/** Stupci, ne objekti: uz 6 700 naselja objekt po naselju bio bi dvostruko veći. */
interface HrPlacesFile {
  names: string[];
  /** Širina × `scale`. */
  lat: number[];
  /** Dužina × `scale`. */
  lon: number[];
  tiers: Record<Tier, { pools: Pool[]; legacy: number[] }>;
}

/** Koordinate su u tisućinkama stupnja, ~100 m. Isto kao `COORD_SCALE` u build-hr.ts. */
const SCALE = 1000;

interface Base {
  file: HrPlacesFile;
  places: Place[];
  geometry: HrGeometry;
  index: SearchIndex;
}

let base: Promise<Base> | null = null;

async function fetchBase(): Promise<Base> {
  const [file, geometry, aliases] = await Promise.all([
    getJson<HrPlacesFile>('hr-places.json'),
    getJson<HrGeometry>('hr-outline.json'),
    getJson<Aliases>('aliases.json'),
  ]);

  const places: Place[] = file.names.map((name, id) => ({
    id,
    // Naselju šifra ne treba izvan igre; jedinstvena je i to je dovoljno za pogodak.
    code: String(id),
    name,
    lat: (file.lat[id] ?? 0) / SCALE,
    lon: (file.lon[id] ?? 0) / SCALE,
  }));

  return { file, places, geometry, index: buildIndex(places, aliases.hr) };
}

export async function loadHr(tier: Tier): Promise<HrData> {
  base ??= fetchBase();
  const { file, places, geometry, index } = await base;
  const { pools, legacy } = file.tiers[tier];
  return { places, tier, geometry, index, pools, legacy };
}
