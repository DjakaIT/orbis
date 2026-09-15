/**
 * Ucitavanje generiranih podataka iz `public/data/`. SPEC §4.
 *
 * Sve se dohvaca jednom i drzi u modulu — datoteke su immutable i dugo keshirane
 * (`public/_headers`), pa nema razloga za ponovni dohvat unutar sesije.
 */

import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';

import { buildIndex, type SearchIndex } from '../engine/search';
import type { Place } from '../types';

interface WorldMeta {
  n: number;
  countries: { id: number; iso: string; a2?: string; name: string; lat: number; lon: number }[];
}

export interface Aliases {
  world: Record<string, string>;
  hr: Record<string, string>;
}

export interface WorldData {
  places: Place[];
  n: number;
  /** Puni N*N niz udaljenosti u km. Cijena po pogotku: jedan pristup nizu. */
  matrix: Uint16Array;
  /** Granice po ISO3 kodu, za crtanje teksture. */
  shapes: Map<string, GeoJSON.Geometry>;
  index: SearchIndex;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Ne mogu ucitati ${path}: HTTP ${String(res.status)}`);
  return (await res.json()) as T;
}

/**
 * Razvija gornji trokut u puni N*N niz.
 *
 * Zapisan je samo trokut jer je matrica simetricna s nulama na dijagonali —
 * upola manji prijenos. Razvijanje se placa jednom pri ucitavanju, da bi
 * `worldDistance` ostao jedan pristup nizu. SPEC §4.3.
 */
export function expandTriangle(triangle: Uint16Array, n: number): Uint16Array {
  const expected = (n * (n - 1)) / 2;
  if (triangle.length !== expected) {
    throw new Error(
      `Matrica ima ${String(triangle.length)} vrijednosti, ocekivano ${String(expected)}`,
    );
  }

  const m = new Uint16Array(n * n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const km = triangle[k++] ?? 0;
      m[i * n + j] = km;
      m[j * n + i] = km;
    }
  }
  return m;
}

let worldPromise: Promise<WorldData> | null = null;

export function loadWorld(): Promise<WorldData> {
  worldPromise ??= fetchWorld();
  return worldPromise;
}

async function fetchWorld(): Promise<WorldData> {
  const [meta, topo, aliases, matrixBuf] = await Promise.all([
    getJson<WorldMeta>('/data/world-meta.json'),
    getJson<Topology>('/data/world-topo.json'),
    getJson<Aliases>('/data/aliases.json'),
    fetch('/data/world-matrix.bin').then(async (r) => {
      if (!r.ok) throw new Error(`Ne mogu ucitati matricu: HTTP ${String(r.status)}`);
      return r.arrayBuffer();
    }),
  ]);

  const places: Place[] = meta.countries.map((c) => ({
    id: c.id,
    code: c.iso,
    a2: c.a2 ?? '',
    name: c.name,
    lat: c.lat,
    lon: c.lon,
  }));

  return {
    places,
    n: meta.n,
    matrix: expandTriangle(new Uint16Array(matrixBuf), meta.n),
    shapes: shapesByIso(topo),
    index: buildIndex(places, aliases.world),
  };
}

/**
 * Topojson → geometrije po ISO3. Kljuc se bira istom logikom kao u pipelineu:
 * ISO_A3_EH kad je valjan, inace ADM0_A3 (Natural Earth ima -99 i za Francusku
 * i za Norvesku — vidi scripts/build-data.ts).
 *
 * Vise feature-a moze dijeliti isti kod: prekomorski teritorij nosi ISO svoje
 * drzave. Zato se **spajaju**, ne prepisuju. Prije je pobjedivao onaj zadnji u
 * datoteci, pa je `AUS` bio Ashmore and Cartier Islands — cetiri tocke usred
 * mora — a cijela Australija se nije crtala. Spajanje je i geografski tocno:
 * pogodak oboji svu kopnenu masu te drzave, ukljucujuci Tasmaniju.
 */
export function shapesByIso(topo: Topology): Map<string, GeoJSON.Geometry> {
  const layerName = Object.keys(topo.objects)[0];
  if (!layerName) throw new Error('topojson nema slojeva');
  const layer = topo.objects[layerName];
  if (!layer) throw new Error('topojson nema slojeva');

  const fc = feature(topo, layer as GeometryCollection) as GeoJSON.FeatureCollection;
  const parts = new Map<string, GeoJSON.Position[][][]>();

  for (const f of fc.features) {
    const p = f.properties as { ISO_A3_EH?: string; ADM0_A3?: string } | null;
    if (!p) continue;
    const iso = p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3;
    if (!iso) continue;

    const g = f.geometry;
    const polygons =
      g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (polygons.length === 0) continue;

    const existing = parts.get(iso);
    if (existing) existing.push(...polygons);
    else parts.set(iso, [...polygons]);
  }

  const out = new Map<string, GeoJSON.Geometry>();
  for (const [iso, polygons] of parts) {
    out.set(
      iso,
      polygons.length === 1 && polygons[0]
        ? { type: 'Polygon', coordinates: polygons[0] }
        : { type: 'MultiPolygon', coordinates: polygons },
    );
  }
  return out;
}
