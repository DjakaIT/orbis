/**
 * Zastave država. SPEC §4.1 — izvor, ne izmišljotina.
 *
 * Emoji zastava (par regionalnih indikatora) bila bi besplatna, ali se na
 * Windowsu ne prikazuje: ondje nijedan sistemski rez nema glifove zastava, pa
 * Chrome ispiše gola dva slova. Zato idu prave slike.
 *
 * Izvor je `lipis/flag-icons` (MIT); same zastave su javno dobro. Dohvaća se
 * jednom u `scripts/.cache/flags` i odatle kopira u `public/flags`, isto kao i
 * ostali izvori — ništa se ne skida u runtimeu i nijedan CDN nije u igri.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CACHE } from './fetch-sources';

const BASE = 'https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3';

export interface FlagResult {
  /** Koliko je zastava završilo u `public/flags`. */
  written: number;
  /** Kodovi za koje izvor nema zastavu. */
  missing: string[];
  /** Ukupna veličina u bajtovima. */
  bytes: number;
  /** Najveća pojedinačna zastava, za bilješku o trošku. */
  largest: { code: string; bytes: number };
}

/**
 * Skida zastave za zadane alpha-2 kodove.
 *
 * Kod koji izvor nema ne ruši pipeline: zastava tada jednostavno ne postoji, a
 * sučelje je već pripremljeno na to jer Kosovo, Sj. Cipar i Somaliland ionako
 * nemaju valjan alpha-2 kod.
 */
export async function buildFlags(codes: string[], out: string): Promise<FlagResult> {
  const cache = join(CACHE, 'flags');
  await mkdir(cache, { recursive: true });
  await mkdir(out, { recursive: true });

  const wanted = [...new Set(codes.map((c) => c.trim().toLowerCase()))].filter((c) =>
    /^[a-z]{2}$/.test(c),
  );

  const missing: string[] = [];
  let written = 0;
  let bytes = 0;
  let largest = { code: '', bytes: 0 };

  for (const code of wanted) {
    const cached = join(cache, `${code}.svg`);

    if (!existsSync(cached)) {
      const res = await fetch(`${BASE}/${code}.svg`);
      if (!res.ok) {
        missing.push(code);
        continue;
      }
      await writeFile(cached, Buffer.from(await res.arrayBuffer()));
    }

    const size = (await stat(cached)).size;
    // Prazna datoteka znaci prekinut dohvat; bolje je nemati zastavu nego slomljenu.
    if (size === 0) {
      missing.push(code);
      continue;
    }

    await copyFile(cached, join(out, `${code}.svg`));
    written += 1;
    bytes += size;
    if (size > largest.bytes) largest = { code, bytes: size };
  }

  return { written, missing, bytes, largest };
}

/** Koliko zastava stoji u izlaznom direktoriju. Za provjeru nakon builda. */
export async function countFlags(out: string): Promise<number> {
  try {
    return (await readdir(out)).filter((f) => f.endsWith('.svg')).length;
  } catch {
    return 0;
  }
}
