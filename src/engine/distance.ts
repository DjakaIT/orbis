/** Udaljenost i smjer. SPEC §5.3. */

const R = 6371;
const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Udaljenost po velikoj kružnici, u kilometrima. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Početni azimut od prve prema drugoj točki, 0–360°, gdje je 0 sjever. */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Svijet: prebuildana matrica, O(1). Nikad haversine na centroidima. */
export function worldDistance(a: number, b: number, m: Uint16Array, n: number): number {
  const v = m[a * n + b];
  if (v === undefined) throw new Error(`Matrica nema par (${String(a)}, ${String(b)})`);
  return v;
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'] as const;

/** Osam smjerova, azimut zaokružen na 45°. Pri udaljenosti 0 meta je pogođena. */
export function arrow(bearingDeg: number, km: number): string {
  if (km === 0) return '✦';
  const i = Math.round(((bearingDeg % 360) + 360) % 360 / 45) % 8;
  return ARROWS[i] ?? '↑';
}

/**
 * Hrvatski zapis tisućica: tanki razmak U+2009. SPEC §2.3.
 * Brojevi se čitaju kao instrument, pa nema decimala.
 */
export function formatKm(km: number): string {
  return `${Math.round(km).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009')}\u2009km`;
}
