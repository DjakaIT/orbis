/**
 * Dohvat sirovih izvora u `scripts/.cache/`. SPEC §4.1.
 *
 * Cache nije u gitu — pipeline je reproducibilan, a CI ga regenerira pri deployu.
 * Za DGU URL nije stabilan: ako dohvat ne uspije, ispisuje se uputa da se dataset
 * spusti rucno. Nijedan URL se ne izmislja.
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

export const NATURAL_EARTH: Source = {
  file: 'ne_110m_admin_0_countries.geojson',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
};

/**
 * DGU Registar prostornih jedinica. URL nije stabilan i mijenja se izmedu izdanja,
 * pa je ovo pokusaj, a ne obecanje.
 */
export const DGU_PLACES: Source = {
  file: 'hr-naselja.json',
  url: 'https://data.gov.hr/api/3/action/package_show?id=registar-prostornih-jedinica',
  manual: [
    'DGU dataset nije dohvacen automatski — URL nije stabilan.',
    '',
    'Rucno:',
    '  1. Otvori https://data.gov.hr i nadi "Registar prostornih jedinica" (DGU).',
    '  2. Skini sloj naselja kao GeoJSON ili SHP.',
    `  3. Spremi ga kao ${join(CACHE, 'hr-naselja.json')}`,
    '',
    'Bez njega mod Hrvatska pada na GeoNames, koji nema sluzbene granice naselja.',
  ].join('\n'),
};

/** GeoNames HR dump — fallback za populaciju naselja. CC BY 4.0. */
export const GEONAMES_HR: Source = {
  file: 'HR.zip',
  url: 'https://download.geonames.org/export/dump/HR.zip',
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
  await fetchSource(GEONAMES_HR);
  await fetchSource(DGU_PLACES);
  console.warn('Gotovo.');
}
