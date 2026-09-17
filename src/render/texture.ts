/**
 * Equirectangular slikar teksture globusa. SPEC §6.1.
 *
 * Jedna sfera, jedna tekstura, jedan draw call — nikad mesh po drzavi. Pri
 * pogotku se preboja samo ta drzava, ne cijela tekstura.
 */

import { BASE_H, BASE_W, paintNatural } from './basemap';

const W = 2048;
const H = 1024;

/** Granice se crtaju tanko; graticule jos tanje. SPEC §6.1. */
const BORDER_WIDTH = 0.8;
const GRATICULE_WIDTH = 1;
const GRATICULE_STEP = 30;

export interface Tokens {
  /** Voda uz obalu. Najsvjetlija voda na kugli. */
  ocean: string;
  /** Otvoreno more, dalje od obale. */
  seaDeep: string;
  /** Vlazno kopno. */
  landmass: string;
  /** Suho kopno — najsvjetlije kopno koje igrac moze pogoditi. */
  landArid: string;
  /** Hladno kopno. */
  landBoreal: string;
  /** Trajni led: Grenland i Antarktika, ni jedno ni drugo u bazenu meta. */
  ice: string;
  hairline: string;
  hit: string;
  /** Svijetla tinta na kugli — natpisi i trag pokusaja. */
  stageInk: string;
}

/** Citanje tokena iz CSS-a drzi boje na jednom mjestu — tokens.css. */
export function readTokens(el: Element = document.documentElement): Tokens {
  const s = getComputedStyle(el);
  const get = (name: string, fallback: string): string =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    ocean: get('--ocean', '#052352'),
    seaDeep: get('--sea-deep', '#02102F'),
    landmass: get('--landmass', '#5B7849'),
    landArid: get('--land-arid', '#91825A'),
    landBoreal: get('--land-boreal', '#6F7969'),
    ice: get('--ice', '#DDE6E8'),
    hairline: get('--hairline', '#6EA3C4'),
    stageInk: get('--stage-ink', '#EEF3F5'),
    // Svoj token, ne --hit: --hit je oklch i kalibriran za papir. Vidi tokens.css.
    hit: get('--hit-stage', 'rgb(178, 248, 212)'),
  };
}

/** `#rgb`, `#rrggbb` ili `rgb(r, g, b)` → tri kanala. */
export function toRgb(value: string): [number, number, number] {
  const plain = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value);
  if (plain) return [Number(plain[1]), Number(plain[2]), Number(plain[3])];

  const hex = value.trim().replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
}

export const project = (lon: number, lat: number, w = W, h = H): [number, number] => [
  ((lon + 180) / 360) * w,
  ((90 - lat) / 180) * h,
];

export type Ring = number[][];

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

/**
 * Prsten koji nakon odmotavanja pokriva vise od punog kruga ne krizi
 * antimeridijan nego **obilazi kuglu**.
 *
 * U cijelom skupu je takav tocno jedan: Antarktika. Njezin obalni prsten ide od
 * -180 do 180 i zatvara se po dnu karte, skokom s (180, -90) na (-180, -90).
 * Odmotavanje taj skok ne vidi kao zatvaranje nego kao nastavak prema istoku, pa
 * doda jos jedan krug — raspon naraste na 386°, put presjece sam sebe i namotaji
 * se ponište. Nonzero fill tada ostavi unutrasnjost prazna: kontinent se crta
 * **izvrnuto**, kao zeleni prsten oko plave sredine.
 *
 * Takvom prstenu sirove koordinate su vec ispravne: skok preko ±180 lezi na
 * lat -90, pa vodoravna crta koju povuce jest donji rub karte.
 */
const FULL_LAP = 350;

/** Tocke prstena i kopije koje treba nacrtati da rub karte ostane cijel. */
export function plan(ring: Ring): { points: [number, number][]; shifts: number[] } {
  const { points, min, max } = unwrap(ring);

  if (max - min > FULL_LAP) {
    const raw: [number, number][] = [];
    for (const p of ring) {
      const lon = p[0];
      const lat = p[1];
      if (lon === undefined || lat === undefined) continue;
      raw.push([lon, lat]);
    }
    return { points: raw, shifts: [0] };
  }

  const shifts = [0];
  if (max > 180) shifts.push(-360);
  if (min < -180) shifts.push(360);
  return { points, shifts };
}

function tracePath(ctx: CanvasRenderingContext2D, points: [number, number][], shift: number): void {
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

function drawGeometry(
  ctx: CanvasRenderingContext2D,
  geometry: GeoJSON.Geometry,
  fill: string | null,
  stroke: string | null,
  lineWidth = BORDER_WIDTH,
): void {
  for (const ring of ringsOf(geometry)) {
    const { points, shifts } = plan(ring);
    for (const shift of shifts) {
      tracePath(ctx, points, shift);
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

/** ISO kodovi trajnog leda. Ni jedan ni drugi nije u bazenu meta. */
const ICE_SHEETS = ['GRL', 'ATA'];

/**
 * Najmanji promjer, u pikselima teksture, ispod kojeg drzava dobiva i mrlju.
 *
 * Mauricijus zauzima 3 × 4 piksela od 2048 × 1024. Obojan je tocno, ali kugla se
 * na ekranu prikazuje na oko 500 px, pa na njega dode manje od jednog piksela —
 * igrac pogodi drzavu i na globusu se ne dogodi nista. Svaki pokusaj mora nesto
 * pokazati, pa se sitnima ispuna prosiri do ove mjere.
 */
export const MIN_VISIBLE_PX = 22;
const SPOT_RADIUS = MIN_VISIBLE_PX / 2;

/** Omeda geometrije u pikselima teksture. */
export function bounds(geometry: GeoJSON.Geometry): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;

  for (const ring of ringsOf(geometry)) {
    for (const point of plan(ring).points) {
      const [x, y] = project(point[0], point[1]);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1 };
}

export class GlobeTexture {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tokens: Tokens;
  private shapes = new Map<string, GeoJSON.Geometry>();

  /**
   * Netaknuta podloga.
   *
   * Dok je kopno bilo jedne boje, vracanje drzave na podlogu je bilo jedno
   * `fill`. Podloga je sada slikana, pa se ne da ponoviti iz boje — cuva se
   * kopija iz koje se izrezuje.
   */
  private readonly base: HTMLCanvasElement;

  constructor(tokens: Tokens) {
    this.tokens = tokens;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D nije dostupan');
    this.ctx = ctx;

    this.base = document.createElement('canvas');
    this.base.width = W;
    this.base.height = H;
  }

  /**
   * Slojevi odozdo prema gore: prirodna podloga → graticule → granice.
   *
   * Podloga se slika na cetvrtini povrsine pa razvlaci — klima i dubina nemaju
   * detalja koji bi smanjenje izgubilo, a racun je cetiri puta jeftiniji. Crta
   * se jednom; pogoci kasnije diraju samo svoju drzavu.
   */
  paintBase(shapes: Map<string, GeoJSON.Geometry>): void {
    this.shapes = shapes;
    const { ctx } = this;

    const small = document.createElement('canvas');
    small.width = BASE_W;
    small.height = BASE_H;
    const sctx = small.getContext('2d', { alpha: false });
    if (!sctx) throw new Error('Canvas 2D nije dostupan');

    const land = this.mask(sctx, [...shapes.values()]);
    const ice = this.mask(
      sctx,
      ICE_SHEETS.flatMap((iso) => {
        const g = shapes.get(iso);
        return g ? [g] : [];
      }),
    );

    paintNatural(sctx, land, ice, {
      shelf: toRgb(this.tokens.ocean),
      abyss: toRgb(this.tokens.seaDeep),
      verdant: toRgb(this.tokens.landmass),
      arid: toRgb(this.tokens.landArid),
      boreal: toRgb(this.tokens.landBoreal),
      ice: toRgb(this.tokens.ice),
    });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, W, H);

    ctx.strokeStyle = this.tokens.hairline;
    ctx.lineWidth = GRATICULE_WIDTH;
    ctx.globalAlpha = 0.28;
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

    // Granice su tise nego prije: podloga sada sama nosi obris kopna.
    ctx.globalAlpha = 0.55;
    for (const geometry of shapes.values()) {
      drawGeometry(ctx, geometry, null, this.tokens.hairline);
    }
    ctx.globalAlpha = 1;

    const bctx = this.base.getContext('2d', { alpha: false });
    bctx?.drawImage(this.canvas, 0, 0);
  }

  /** Rasterizira geometrije u masku BASE_W × BASE_H: 1 unutra, 0 vani. */
  private mask(sctx: CanvasRenderingContext2D, geometries: GeoJSON.Geometry[]): Uint8Array {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, BASE_W, BASE_H);

    /*
     * Geometrije se projiciraju u punu rezoluciju, pa se crtez skalira ovdje.
     * Tako `drawGeometry` ostaje jedini put kroz koji oblici prolaze — ukljucujuci
     * odmotavanje longituda i Antarktiku, koji se ne smiju racunati dvaput.
     */
    sctx.setTransform(BASE_W / W, 0, 0, BASE_H / H, 0, 0);
    for (const geometry of geometries) drawGeometry(sctx, geometry, '#fff', '#fff', 1);
    sctx.setTransform(1, 0, 0, 1, 0, 0);

    const { data } = sctx.getImageData(0, 0, BASE_W, BASE_H);
    const out = new Uint8Array(BASE_W * BASE_H);
    for (let i = 0; i < out.length; i++) out[i] = data[i * 4]! > 127 ? 1 : 0;
    return out;
  }

  /**
   * Preboja jednu drzavu. `alpha` vodi animaciju ulijevanja boje: podloga se
   * svaki put vrati na izvornu pa se boja nanese jednom, inace bi se slojevi
   * zbrajali kroz frameove. SPEC §2.5.
   */
  paintCountry(code: string, color: string, alpha = 1): boolean {
    const geometry = this.shapes.get(code);
    if (!geometry) return false;

    const { ctx } = this;
    const box = bounds(geometry);
    const tiny = Math.max(box.x1 - box.x0, box.y1 - box.y0) < MIN_VISIBLE_PX;

    // Vrati izvornu podlogu pod ovom drzavom, pa nanesi boju jednom.
    ctx.save();
    ctx.beginPath();
    for (const ring of ringsOf(geometry)) {
      const { points, shifts } = plan(ring);
      for (const shift of shifts) {
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          if (!p) continue;
          const [x, y] = project(p[0] + shift, p[1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
    }
    ctx.clip();
    ctx.drawImage(this.base, 0, 0);
    ctx.restore();

    ctx.globalAlpha = alpha;
    drawGeometry(ctx, geometry, color, null);
    ctx.globalAlpha = 1;
    drawGeometry(ctx, geometry, null, this.tokens.hairline);

    if (tiny) this.spot(box, color, alpha);
    return true;
  }

  /**
   * Prosiruje ispunu drzave premale da bi se vidjela.
   *
   * Puna mrlja u boji udaljenosti, ne kolut oko nje: kolut je oznaka koja stoji
   * *pored* podatka, a boja je sam podatak — sitna drzava se tako cita istom
   * mjerom kao i svaka druga, samo krupnije nacrtana. SPEC §2.1.
   */
  private spot(
    box: { x0: number; y0: number; x1: number; y1: number },
    color: string,
    alpha: number,
  ): void {
    const { ctx } = this;
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, SPOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Tanak rub drzi mrlju u istom rjecniku kao i granice drzava.
    ctx.strokeStyle = this.tokens.hairline;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  has(code: string): boolean {
    return this.shapes.has(code);
  }
}
