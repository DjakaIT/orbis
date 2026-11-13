/**
 * Dohvat sirovih izvora u `scripts/.cache/`. SPEC §4.1.
 *
 * Cache nije u gitu — pipeline je reproducibilan, a CI ga regenerira pri deployu.
 * Nijedan URL se ne izmislja. Wikidata se ne dohvaca ovdje nego u
 * `fetch-wikidata.ts`, u snimku koja je u gitu.
 *
 * GeoNames i DGU vise nisu izvori: hrvatska naselja od 2026-11 dolaze iz Wikidate
 * (DGU dataset nikad nije bio dohvatljiv, a GeoNames nije imao broj stanovnika
 * za vecinu naselja u Dalmaciji i Lici). Vidi DECISIONS.md.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE = join(HERE, '.cache');

export interface Source {
  /** Ime datoteke u cacheu. */
  file: string;
  url: string;
  /** Sto uciniti ako dohvat ne uspije. Prazno znaci: pipeline ne moze dalje. */
  manual?: string;
}

/**
 * Izdanje Natural Eartha, prikovano. `master` grana se može promijeniti između
 * dva deploya, a granice određuju bazen meta — pa i niz meta. v5.1.2 je
 * zadnje izdanje i bajt-za-bajt isto što je `master` davao do sada (sha256
 * provjeren 2026-11-12).
 */
const NE_RELEASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson';

/**
 * Granice drzava. **50m, ne 110m.**
 *
 * 110m je najgrublji sloj i iz njega jednostavno ispadnu male drzave: Andora,
 * Monako, San Marino, Lihtenstajn, Malta, Singapur, Vatikan i jos desetak. Ondje
 * ih nema, pa ih nije bilo ni u igri. 50m ima svih 242 zapisa i 3 MB se skida
 * jednom u cache.
 */
export const NATURAL_EARTH: Source = {
  file: 'ne_50m_admin_0_countries.geojson',
  url: `${NE_RELEASE}/ne_50m_admin_0_countries.geojson`,
};

/**
 * Isti sloj podijeljen na zemljopisne jedinice. Odavde dolaze samo četiri dijela
 * Ujedinjenog Kraljevstva — Engleska, Škotska, Wales i Sjeverna Irska su
 * zasebne mete. Ostale države ostaju iz sloja država: ovaj bi inače razbio i
 * Belgiju, Bosnu i Hercegovinu i Portugal na dijelove koji nisu države.
 */
export const NE_MAP_UNITS: Source = {
  file: 'ne_50m_admin_0_map_units.geojson',
  url: `${NE_RELEASE}/ne_50m_admin_0_map_units.geojson`,
};

/**
 * Županijske granice i obris Hrvatske. 10m rezolucija, ne 50m: hrvatska je obala
 * razvedena i na grubljem sloju se pretvori u ravnu crtu. 39 MB se skida jednom
 * i ostaje u cacheu.
 */
export const NE_ADMIN1: Source = {
  file: 'ne_10m_admin_1_states_provinces.geojson',
  url: `${NE_RELEASE}/ne_10m_admin_1_states_provinces.geojson`,
};

/**
 * Dohvaca izvor ako vec nije u cacheu. Vraca putanju ili `null` ako izvor
 * nije dostupan, a ima rucnu uputu.
 */
export async function fetchSource(source: Source): Promise<string | null> {
  await mkdir(CACHE, { recursive: true });
  const target = join(CACHE, source.file);

  if (existsSync(target)) {
    console.warn(`  cache  ${source.file}`);
    return target;
  }

  console.warn(`  dohvat ${source.file}`);
  try {
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`HTTP ${String(res.status)} ${res.statusText}`);
    const body = Buffer.from(await res.arrayBuffer());
    await writeFile(target, body);
    const sum = createHash('sha256').update(body).digest('hex').slice(0, 12);
    console.warn(`         ${String(Math.round(body.byteLength / 1024))} KB · sha256:${sum}`);
    return target;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (source.manual) {
      console.warn(`\n${source.manual}\n\n  (razlog: ${reason})\n`);
      return null;
    }
    throw new Error(`Ne mogu dohvatiti ${source.url}: ${reason}`, { cause: err });
  }
}

export async function readCached(file: string): Promise<string> {
  return readFile(join(CACHE, file), 'utf8');
}

/** Pokrenuto izravno: dohvati sve izvore i stani. */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  console.warn('Izvori →');
  await fetchSource(NATURAL_EARTH);
  await fetchSource(NE_MAP_UNITS);
  await fetchSource(NE_ADMIN1);
  console.warn('Gotovo.');
}
