/**
 * Karta Hrvatske. Canvas 2D, bez WebGL-a. SPEC §6.2.
 *
 * Naselja su točke pa nema ispune područja. Umjesto toga oko svakog pogotka ide
 * tanki prsten radijusa proporcionalnog udaljenosti — igrač vidi da je meta
 * „negdje na ovom krugu". Prsteni se sijeku i sužavaju prostor.
 */

import { geoConicConformal, type GeoProjection } from 'd3-geo';

import type { Tokens } from './texture';

const PAD = 16;
const DOT_R = 5;
const TARGET_R = 7;

export interface MapPoint {
  name: string;
  lat: number;
  lon: number;
  km: number;
  color: string;
  /** Je li ovo meta. Nikad se ne izvodi iz `km === 0`. */
  hit: boolean;
}

/** Obris je GeometryCollection jer mapshaperov `-dissolve` tako izlazi. */
export interface HrGeometry {
  outline: GeoJSON.GeometryCollection;
  counties: GeoJSON.FeatureCollection;
}

/**
 * Konična konformna projekcija s paralelama kroz Hrvatsku. SPEC §6.2.
 * `fitExtent` svaki put iznova jer ovisi o veličini canvasa.
 */
export function projectionFor(
  geometry: GeoJSON.GeometryCollection,
  w: number,
  h: number,
): GeoProjection {
  return geoConicConformal()
    .parallels([43.0, 46.0])
    .rotate([-16.5, 0])
    .center([0, 44.8])
    .fitExtent(
      [
        [PAD, PAD],
        [w - PAD, h - PAD],
      ],
      geometry,
    );
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  geometry: GeoJSON.GeoJsonObject,
): void {
  ctx.beginPath();
  for (const ring of ringsOf(geometry)) {
    let first = true;
    for (const p of ring) {
      const lon = p[0];
      const lat = p[1];
      if (lon === undefined || lat === undefined) continue;
      const xy = projection([lon, lat]);
      if (!xy) continue;
      if (first) {
        ctx.moveTo(xy[0], xy[1]);
        first = false;
      } else {
        ctx.lineTo(xy[0], xy[1]);
      }
    }
    ctx.closePath();
  }
}

function ringsOf(geometry: GeoJSON.GeoJsonObject): number[][][] {
  const g = geometry as {
    type: string;
    coordinates?: unknown;
    geometries?: GeoJSON.GeoJsonObject[];
    features?: { geometry: GeoJSON.GeoJsonObject }[];
  };

  if (g.type === 'Polygon') return g.coordinates as number[][][];
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).flat();
  if (g.type === 'GeometryCollection') return (g.geometries ?? []).flatMap(ringsOf);
  if (g.type === 'FeatureCollection') return (g.features ?? []).flatMap((f) => ringsOf(f.geometry));
  if (g.type === 'Feature') return ringsOf((g as unknown as GeoJSON.Feature).geometry);
  return [];
}

/**
 * Koliko piksela je jedan kilometar u ovoj projekciji, mjereno kroz središte
 * Hrvatske. Prsteni udaljenosti moraju biti u istom mjerilu kao karta.
 */
function pixelsPerKm(projection: GeoProjection): number {
  const centre = projection([16.5, 44.8]);
  // Jedan stupanj geografske širine je 111,32 km.
  const north = projection([16.5, 45.8]);
  if (!centre || !north) return 1;
  return Math.hypot(north[0] - centre[0], north[1] - centre[1]) / 111.32;
}

export interface DrawOptions {
  geometry: HrGeometry;
  points: MapPoint[];
  /** Meta se crta tek nakon pogotka. */
  target: { lat: number; lon: number } | null;
  tokens: Tokens;
  ink: string;
}

/**
 * Slojevi: obris → županijske granice → prsteni → pogođena naselja → meta.
 * SPEC §6.2.
 */
export function drawMap(canvas: HTMLCanvasElement, options: DrawOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ratio = Math.min(globalThis.devicePixelRatio, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const { geometry, points, target, tokens, ink } = options;
  const projection = projectionFor(geometry.outline, w, h);

  tracePath(ctx, projection, geometry.outline);
  ctx.fillStyle = tokens.landmass;
  ctx.fill();
  ctx.strokeStyle = tokens.hairline;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = tokens.hairline;
  ctx.lineWidth = 0.5;
  tracePath(ctx, projection, geometry.counties);
  ctx.stroke();
  ctx.restore();

  const scale = pixelsPerKm(projection);

  // Prsteni idu ispod točaka da ih ne prekriju.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  for (const p of points) {
    if (p.hit) continue;
    const xy = projection([p.lon, p.lat]);
    if (!xy) continue;
    ctx.strokeStyle = p.color;
    ctx.beginPath();
    ctx.arc(xy[0], xy[1], p.km * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  for (const p of points) {
    const xy = projection([p.lon, p.lat]);
    if (!xy) continue;

    ctx.fillStyle = p.hit ? tokens.hit : p.color;
    ctx.beginPath();
    ctx.arc(xy[0], xy[1], DOT_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ink;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name, xy[0] + DOT_R + 4, xy[1]);
  }

  if (target) {
    const xy = projection([target.lon, target.lat]);
    if (xy) {
      ctx.strokeStyle = tokens.hit;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], TARGET_R, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
