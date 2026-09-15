/**
 * Spremište lige. Netlify Blobs u pogonu, mapa u testovima.
 *
 * Sva logika lige radi protiv ovog sučelja, ne protiv Blobsa izravno. To nije
 * apstrakcija zbog apstrakcije: prije se logika lige mogla provjeriti samo protiv
 * pokrenutog Workera, pa su se ti testovi **preskakali** kad ga nema — i upravo
 * je to propustilo bug s nespojenim API-jem. Ovako cijeli API ima obične testove
 * koji se uvijek izvršavaju.
 */

export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  /** Ključevi koji počinju zadanim prefiksom. */
  list(prefix: string): Promise<string[]>;
}

/**
 * Netlify Blobs.
 *
 * Import je dinamičan da `netlify/lib` ostane uvozljiv u testovima i bez
 * Netlifyjeve okoline — paket pri učitavanju traži kontekst kojeg ondje nema.
 */
export async function blobStore(name = 'orbis-league'): Promise<Store> {
  const { getStore } = await import('@netlify/blobs');
  const blobs = getStore({ name, consistency: 'strong' });

  return {
    async get<T>(key: string): Promise<T | null> {
      return ((await blobs.get(key, { type: 'json' })) as T | null) ?? null;
    },
    async set(key: string, value: unknown): Promise<void> {
      await blobs.setJSON(key, value);
    },
    async remove(key: string): Promise<void> {
      await blobs.delete(key);
    },
    async list(prefix: string): Promise<string[]> {
      const { blobs: found } = await blobs.list({ prefix });
      return found.map((b) => b.key);
    },
  };
}

/** Spremište u memoriji. Isto ponašanje, bez mreže — za testove. */
export function memoryStore(): Store {
  const data = new Map<string, string>();

  return {
    get<T>(key: string): Promise<T | null> {
      const raw = data.get(key);
      return Promise.resolve(raw === undefined ? null : (JSON.parse(raw) as T));
    },
    set(key: string, value: unknown): Promise<void> {
      // Serijalizacija, ne referenca: inače bi test mijenjao spremljeno naknadno.
      data.set(key, JSON.stringify(value));
      return Promise.resolve();
    },
    remove(key: string): Promise<void> {
      data.delete(key);
      return Promise.resolve();
    },
    list(prefix: string): Promise<string[]> {
      return Promise.resolve([...data.keys()].filter((k) => k.startsWith(prefix)).sort());
    },
  };
}
