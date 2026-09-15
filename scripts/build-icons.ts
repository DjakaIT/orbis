/**
 * Ikone i OG slika. SPEC §10, faza 4.
 *
 * PNG se piše ručno preko `zlib` — nema `sharp` ni `canvas`. Motiv je globus s
 * graticulom, isti vizualni rječnik kao u igri: instrumentni, ne dekorativni,
 * i u istim tokenima iz §2.2.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public');

/** Tokeni iz src/styles/tokens.css. */
export const VOID: RGB = [0x08, 0x0b, 0x14];
export const OCEAN: RGB = [0x10, 0x18, 0x2b];
export const HAIRLINE: RGB = [0x2c, 0x3a, 0x57];
export const INK: RGB = [0xe6, 0xea, 0xf2];

export type RGB = [number, number, number];

class Bitmap {
  readonly width: number;
  readonly height: number;
  private readonly px: Uint8Array;

  constructor(width: number, height: number, fill: RGB) {
    this.width = width;
    this.height = height;
    this.px = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) this.set(i, fill, 1);
  }

  private set(index: number, color: RGB, alpha: number): void {
    const o = index * 3;
    for (let c = 0; c < 3; c++) {
      const under = this.px[o + c] ?? 0;
      this.px[o + c] = Math.round(under * (1 - alpha) + (color[c] ?? 0) * alpha);
    }
  }

  /** Nanosi boju s alfom, uz odsijecanje izvan okvira. */
  blend(x: number, y: number, color: RGB, alpha: number): void {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.set(y * this.width + x, color, Math.min(alpha, 1));
  }

  /**
   * Ispunjeni krug s mekim rubom. Uzorkuje se udaljenost od središta, pa je rub
   * antialiasiran bez ijedne biblioteke.
   */
  disc(cx: number, cy: number, r: number, color: RGB): void {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        this.blend(x, y, color, clamp(r - d + 0.5));
      }
    }
  }

  /** Prsten zadane debljine, isti postupak kao `disc`. */
  ring(cx: number, cy: number, r: number, width: number, color: RGB, alpha = 1): void {
    const outer = r + width / 2;
    for (let y = Math.floor(cy - outer - 1); y <= Math.ceil(cy + outer + 1); y++) {
      for (let x = Math.floor(cx - outer - 1); x <= Math.ceil(cx + outer + 1); x++) {
        const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r);
        this.blend(x, y, color, clamp(width / 2 - d + 0.5) * alpha);
      }
    }
  }

  /**
   * Elipsa kao meridijan na globusu: krug stisnut po x-osi.
   *
   * Hoda se parametarski i uzorak se razlijeva bilinearno na četiri susjedna
   * piksela. Uzorkovanje po pikselnoj mreži bi se na strmim dijelovima elipse
   * raspalo u crtice.
   */
  meridian(cx: number, cy: number, r: number, squeeze: number, color: RGB, alpha: number): void {
    const rx = Math.max(r * squeeze, 0.5);
    const steps = Math.ceil(4 * Math.PI * r);
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      this.splat(cx + rx * Math.cos(t), cy + r * Math.sin(t), color, alpha);
    }
  }

  /** Bilinearno razlijevanje jedne točke na susjedne piksele. */
  private splat(x: number, y: number, color: RGB, alpha: number): void {
    const x0 = Math.floor(x - 0.5);
    const y0 = Math.floor(y - 0.5);
    const fx = x - 0.5 - x0;
    const fy = y - 0.5 - y0;
    this.blend(x0, y0, color, (1 - fx) * (1 - fy) * alpha);
    this.blend(x0 + 1, y0, color, fx * (1 - fy) * alpha);
    this.blend(x0, y0 + 1, color, (1 - fx) * fy * alpha);
    this.blend(x0 + 1, y0 + 1, color, fx * fy * alpha);
  }

  /** Okomiti meridijan kroz središte, odsječen na disk. */
  vline(cx: number, cy: number, r: number, color: RGB, alpha: number): void {
    for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y++) {
      this.blend(Math.round(cx), y, color, alpha);
    }
  }

  /** Vodoravna paralela, odsječena na disk. */
  parallel(cx: number, cy: number, r: number, y: number, color: RGB, alpha: number): void {
    const half = Math.sqrt(Math.max(r * r - (y - cy) ** 2, 0));
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      this.blend(x, Math.round(y), color, alpha);
    }
  }

  toPng(): Buffer {
    const raw = Buffer.alloc(this.height * (this.width * 3 + 1));
    for (let y = 0; y < this.height; y++) {
      const row = y * (this.width * 3 + 1);
      raw[row] = 0; // filter: none
      for (let x = 0; x < this.width * 3; x++) {
        raw[row + 1 + x] = this.px[y * this.width * 3 + x] ?? 0;
      }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // truecolor RGB

    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

function clamp(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

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

/** Globus s graticulom, centriran. `scale` je udio stranice koji zauzima. */
function drawGlobe(bmp: Bitmap, cx: number, cy: number, r: number): void {
  bmp.disc(cx, cy, r, OCEAN);

  /*
   * Wireframe, bez naznake kopna: vizualni rječnik je instrumentni, ne
   * dekorativni — stare zvjezdane karte i gravirane skale. SPEC §2.1.
   */
  const inner = r * 0.985;
  for (const squeeze of [0.34, 0.7]) {
    bmp.meridian(cx, cy, inner, squeeze, HAIRLINE, 0.85);
  }
  bmp.vline(cx, cy, inner, HAIRLINE, 0.85);
  for (const t of [-0.6, -0.3, 0, 0.3, 0.6]) {
    bmp.parallel(cx, cy, inner, cy + r * t, HAIRLINE, t === 0 ? 0.85 : 0.55);
  }

  bmp.ring(cx, cy, r, Math.max(r * 0.04, 1.5), INK, 0.95);
}

export function icon(size: number, padding: number): Buffer {
  const bmp = new Bitmap(size, size, VOID);
  drawGlobe(bmp, size / 2, size / 2, (size / 2) * (1 - padding));
  return bmp.toPng();
}

/** OG slika, 1200 × 630. Globus lijevo, prazan prostor desno za naslov. */
export function og(): Buffer {
  const bmp = new Bitmap(1200, 630, VOID);
  drawGlobe(bmp, 330, 315, 215);
  return bmp.toPng();
}

export async function buildIcons(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  const files: [string, Buffer][] = [
    ['icon-192.png', icon(192, 0.06)],
    ['icon-512.png', icon(512, 0.06)],
    // Maskable traži 20% sigurnu zonu: sadržaj se stisne da ga obrezivanje ne siječe.
    ['icon-maskable-512.png', icon(512, 0.22)],
    ['apple-touch-icon.png', icon(180, 0.06)],
    ['og.png', og()],
  ];

  for (const [name, data] of files) {
    await writeFile(join(OUT, name), data);
    console.warn(`  ${name.padEnd(24)} ${String(Math.round(data.byteLength / 1024))} KB`);
  }
}
