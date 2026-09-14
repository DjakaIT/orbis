/**
 * Gradijent udaljenosti. SPEC §5.5.
 *
 * Ovo je jedina zasićena boja u aplikaciji — sve ostalo je desaturirani chrome,
 * pa svaki obojani piksel izvan ovoga krade signal od podatka. SPEC §2.1.
 */

import type { Mode } from './seed';

/** Najveća smislena udaljenost po modu; iznad toga gradijent je zasićen. */
const MAX_KM: Record<Mode, number> = { world: 20000, hr: 400 };

interface Lch {
  l: number;
  c: number;
  h: number;
}

/**
 * Odvojena skala za Hrvatsku je nužna: na svjetskoj skali cijela Hrvatska
 * bila bi jedna te ista crvena.
 */
function ramp(km: number, mode: Mode): Lch {
  const t = Math.min(Math.max(km, 0) / MAX_KM[mode], 1);
  return {
    l: 0.78 - t * 0.34, // blizu = svjetlije
    c: 0.2 - t * 0.09, // blizu = zasićenije
    h: 28 + t * 232, // crvena → narančasta → … → indigo
  };
}

/** CSS boja za udaljenost. Pogodak vraća token `--hit`. */
export function distanceColor(km: number, mode: Mode): string {
  if (km === 0) return 'var(--hit)';
  const { l, c, h } = ramp(km, mode);
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/**
 * Ista boja kao `distanceColor`, ali kao `rgb()` — Canvas 2D ne prima `oklch`
 * pouzdano u svim preglednicima, a tekstura globusa se crta upravo na canvasu.
 */
export function distanceRgb(km: number, mode: Mode): string {
  const { l, c, h } = ramp(km, mode);
  return oklchToRgb(l, c, h);
}

const toSrgb = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

const clamp255 = (x: number): number => Math.max(0, Math.min(255, Math.round(x * 255)));

/**
 * OKLCh → sRGB. Koeficijenti su Björn Ottossonova matrica OKLab→LMS→linearni sRGB.
 * Boje izvan sRGB gamuta se odsijecaju po kanalu.
 */
export function oklchToRgb(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lc = l_ * l_ * l_;
  const mc = m_ * m_ * m_;
  const sc = s_ * s_ * s_;

  const r = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;

  return `rgb(${String(clamp255(toSrgb(r)))} ${String(clamp255(toSrgb(g)))} ${String(clamp255(toSrgb(bl)))})`;
}

/**
 * Kvadratić za share tekst — udaljenost mapirana na najbliži emoji. SPEC §7.6.
 *
 * Zelena je rezervirana za pogodak. Da je i najbliži promašaj zelen, iz grida se
 * ne bi vidjelo gdje je partija zapravo završila.
 */
const SQUARES = ['🟨', '🟧', '🟪', '🟦'] as const;

export function distanceSquare(km: number, mode: Mode): string {
  if (km === 0) return '🟩';
  const t = Math.min(Math.max(km, 0) / MAX_KM[mode], 1);
  const i = Math.min(SQUARES.length - 1, Math.floor(t * SQUARES.length));
  return SQUARES[i] ?? '🟦';
}
