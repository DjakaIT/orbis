/**
 * Adrese generiranih podataka.
 *
 * U buildu svaka datoteka dobiva sadržajni hash u imenu (`world-meta.3f2a1b9c.json`),
 * a ova karta dolazi iz `vite.config.ts`. Bez toga bi promjena podataka ostala
 * nevidljiva: `public/_headers` kaže `immutable` na godinu dana, a service worker
 * ih drži `CacheFirst` — igrač bi nakon deploya dobio novi kod sa starim popisom.
 *
 * U developmentu i testovima karte nema i ime ostaje kakvo jest.
 */

declare const __DATA_FILES__: Record<string, string> | undefined;

const FILES: Record<string, string> = typeof __DATA_FILES__ === 'undefined' ? {} : __DATA_FILES__;

export function dataUrl(name: string): string {
  return `/data/${FILES[name] ?? name}`;
}

export async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(dataUrl(name));
  if (!res.ok) throw new Error(`Ne mogu učitati ${name}: HTTP ${String(res.status)}`);
  return (await res.json()) as T;
}
