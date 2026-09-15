/**
 * Equirectangular slikar teksture globusa. SPEC §6.1.
 *
 * Jedna sfera, jedna tekstura, jedan draw call — nikad mesh po drzavi. Pri
 * pogotku se preboja samo ta drzava, ne cijela tekstura.
 */

const W = 2048;
const H = 1024;

/** Granice se crtaju tanko; graticule jos tanje. SPEC §6.1. */
const BORDER_WIDTH = 0.8;
const GRATICULE_WIDTH = 1;
const GRATICULE_STEP = 30;

export interface Tokens {
  ocean: string;
  landmass: string;
  hairline: string;
  hit: string;
}

/** Citanje tokena iz CSS-a drzi boje na jednom mjestu — tokens.css. */
export function readTokens(el: Element = document.documentElement): Tokens {
  const s = getComputedStyle(el);
  const get = (name: string, fallback: string): string =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    ocean: get('--ocean', '#16211C'),
    landmass: get('--landmass', '#33351F'),
    hairline: get('--hairline', '#575234'),
    // --hit je oklch u CSS-u; canvas ga ne prima pouzdano, pa ide sRGB ekvivalent.
    hit: 'rgb(88 224 148)',
  };
}

export const project = (lon: number, lat: number, w = W, h = H): [number, number] => [
  ((lon + 180) / 360) * w,
  ((90 - lat) / 180) * h,
];

type Ring = number[][];

function ringsOf(geometry: GeoJSON.Geometry): Ring[] {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

/**
 * Longitude se "odmotaju" tako da se susjedne tocke nikad ne razlikuju za vise
 * od 180°.
 *
 * Bez toga poligoni preko antimeridijana (Rusija, Fidzi) dobiju vodoravnu crtu
 * preko cijele karte. SPEC §6.1.
 */
export function unwrap(ring: Ring): { points: [number, number][]; min: number; max: number } {
  const points: [number, number][] = [];
  let offset = 0;
  let previous: number | null = null;
  let min = Infinity;
  let max = -Infinity;

  for (const p of ring) {
    const lon = p[0];
    const lat = p[1];
    if (lon === undefined || lat === undefined) continue;
    if (previous !== null) {
      const d = lon + offset - previous;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
    }
    const shifted = lon + offset;
    previous = shifted;
    if (shifted < min) min = shifted;
    if (shifted > max) max = shifted;
    points.push([shifted, lat]);
  }

  return { points, min, max };
}

function tracePath(ctx: CanvasRenderingContext2D, ring: Ring, shift: number): void {
  const { points } = unwrap(ring);
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) continue;
    const [x, y] = project(p[0] + shift, p[1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Koje kopije poligona treba nacrtati da prijelaz preko ruba karte ostane cijel. */
function shiftsFor(ring: Ring): number[] {
  const { min, max } = unwrap(ring);
  const shifts = [0];
  if (max > 180) shifts.push(-360);
  if (min < -180) shifts.push(360);
  return shifts;
}

function drawGeometry(
  ctx: CanvasRenderingContext2D,
  geometry: GeoJSON.Geometry,
  fill: string | null,
  stroke: string | null,
  lineWidth = BORDER_WIDTH,
): void {
  for (const ring of ringsOf(geometry)) {
    for (const shift of shiftsFor(ring)) {
      tracePath(ctx, ring, shift);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    }
  }
}

export class GlobeTexture {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tokens: Tokens;
  private shapes = new Map<string, GeoJSON.Geometry>();

  constructor(tokens: Tokens) {
    this.tokens = tokens;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D nije dostupan');
    this.ctx = ctx;
  }

  /**
   * Slojevi odozdo prema gore: ocean → graticule → kopno → granice.
   * Crta se jednom; pogoci kasnije diraju samo svoju drzavu.
   */
  paintBase(shapes: Map<string, GeoJSON.Geometry>): void {
    this.shapes = shapes;
    const { ctx } = this;

    ctx.fillStyle = this.tokens.ocean;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = this.tokens.hairline;
    ctx.lineWidth = GRATICULE_WIDTH;
    ctx.globalAlpha = 0.5;
    for (let lon = -180; lon <= 180; lon += GRATICULE_STEP) {
      const x = project(lon, 0)[0];
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let lat = -90 + GRATICULE_STEP; lat < 90; lat += GRATICULE_STEP) {
      const y = project(0, lat)[1];
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const geometry of shapes.values()) {
      drawGeometry(ctx, geometry, this.tokens.landmass, this.tokens.hairline);
    }
  }

  /**
   * Preboja jednu drzavu. `alpha` vodi animaciju ulijevanja boje: podloga se
   * svaki put vrati na kopno pa se boja nanese jednom, inace bi se slojevi
   * zbrajali kroz frameove. SPEC §2.5.
   */
  paintCountry(code: string, color: string, alpha = 1): boolean {
    const geometry = this.shapes.get(code);
    if (!geometry) return false;

    const { ctx } = this;
    drawGeometry(ctx, geometry, this.tokens.landmass, null);
    ctx.globalAlpha = alpha;
    drawGeometry(ctx, geometry, color, null);
    ctx.globalAlpha = 1;
    drawGeometry(ctx, geometry, null, this.tokens.hairline);
    return true;
  }

  has(code: string): boolean {
    return this.shapes.has(code);
  }
}
