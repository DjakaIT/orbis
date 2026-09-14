/**
 * Minimalno čitanje ZIP arhive. GeoNames dumpove servira samo kao `.zip`.
 *
 * Četrdesetak linija umjesto ovisnosti: čita se centralni direktorij, ne lokalna
 * zaglavlja, jer GeoNames piše veličine u data descriptor pa su u lokalnom
 * zaglavlju nule.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const STORED = 0;
const DEFLATED = 8;

/** Vraća sadržaj jednog člana arhive kao tekst. */
export function readZipEntry(zip: Buffer, entry: string): string {
  const eocd = findEocd(zip);
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(offset) !== CENTRAL) {
      throw new Error('Neispravan centralni direktorij u ZIP arhivi');
    }
    const method = zip.readUInt16LE(offset + 10);
    const compressed = zip.readUInt32LE(offset + 20);
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');

    if (name === entry) return inflateAt(zip, localOffset, method, compressed);
    offset += 46 + nameLen + extraLen + commentLen;
  }

  throw new Error(`ZIP arhiva nema člana ${entry}`);
}

function inflateAt(zip: Buffer, localOffset: number, method: number, size: number): string {
  const nameLen = zip.readUInt16LE(localOffset + 26);
  const extraLen = zip.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = zip.subarray(start, start + size);

  if (method === STORED) return data.toString('utf8');
  if (method === DEFLATED) return inflateRawSync(data).toString('utf8');
  throw new Error(`Nepoznata metoda kompresije: ${String(method)}`);
}

/** EOCD je na kraju arhive, iza komentara promjenjive duljine. */
function findEocd(zip: Buffer): number {
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === EOCD) return i;
  }
  throw new Error('ZIP arhiva nema End of Central Directory zapis');
}
