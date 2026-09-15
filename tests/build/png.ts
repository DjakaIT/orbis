/**
 * Minimalni PNG citac za testove. Pise ga vlastiti koder u `scripts/build-icons.ts`,
 * pa se ne smije provjeravati istim kodom kojim je nastao — ovo dekodira zaglavlja
 * i piksele neovisno, po specifikaciji formata.
 */

import { inflateSync } from 'node:zlib';

export interface Png {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  /** Redoslijed chunkova kako se pojavljuju. */
  chunks: string[];
  /** Piksel kao [r, g, b]. */
  at(x: number, y: number): [number, number, number];
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Dekodira PNG i usput provjerava potpis, duljine i CRC svakog chunka.
 * Svako odstupanje je iznimka — test tada pada s razlogom, ne s krivim pikselom.
 */
export function decodePng(buf: Buffer): Png {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('Nije PNG: krivi potpis');

  const chunks: string[] = [];
  let ihdr: Buffer | null = null;
  const idat: Buffer[] = [];

  let o = 8;
  while (o < buf.length) {
    const length = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + length);
    const declared = buf.readUInt32BE(o + 8 + length);
    const actual = crc32(buf.subarray(o + 4, o + 8 + length));
    if (declared !== actual) throw new Error(`CRC ne valja za chunk ${type}`);

    chunks.push(type);
    if (type === 'IHDR') ihdr = Buffer.from(data);
    if (type === 'IDAT') idat.push(Buffer.from(data));
    o += 12 + length;
  }

  if (o !== buf.length) throw new Error('Visak bajtova iza zadnjeg chunka');
  if (!ihdr) throw new Error('Nema IHDR chunka');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8] ?? 0;
  const colorType = ihdr[9] ?? 0;
  if (bitDepth !== 8 || colorType !== 2) {
    throw new Error(
      `Ocekivan 8-bitni truecolor, dobiven depth ${String(bitDepth)} type ${String(colorType)}`,
    );
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  if (raw.length !== height * (stride + 1)) {
    throw new Error(
      `IDAT duljina ${String(raw.length)}, ocekivano ${String(height * (stride + 1))}`,
    );
  }

  // Koder pise filter 0 (none) na svaki red; drugi filtri ovdje nisu podrzani
  // i tisi ih ne zelimo — neocekivan filter znaci da se koder promijenio.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter !== 0) throw new Error(`Red ${String(y)} ima filter ${String(filter)}, ocekivan 0`);
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    chunks,
    at(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        throw new Error(`Piksel (${String(x)}, ${String(y)}) je izvan slike`);
      }
      const p = y * (stride + 1) + 1 + x * 3;
      return [raw[p] ?? 0, raw[p + 1] ?? 0, raw[p + 2] ?? 0];
    },
  };
}

/** Najveca razlika po kanalu — dovoljno za „je li ovo ta boja". */
export function channelDistance(a: readonly number[], b: readonly number[]): number {
  return Math.max(...[0, 1, 2].map((i) => Math.abs((a[i] ?? 0) - (b[i] ?? 0))));
}
