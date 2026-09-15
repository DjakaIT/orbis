import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { subsetCharacters } from '../../scripts/build-font';

/**
 * Podskup fonta iz faze 4. SPEC §9.5 trazi woff2 ispod 32 KB, a puni rez je 185 KB.
 *
 * Rizik podskupljivanja je tih: znak koji je ispao ne rusi nista, nego se ispise
 * system-ui rezom usred hrvatske recenice. Zato se pokrivenost provjerava protiv
 * dva izvora istine — generiranih podataka i stvarnih nizova u kodu — a ne protiv
 * popisa prepisanog iz iste glave koja je pisao `UI_TEXT`.
 */

const DATA = join(import.meta.dirname, '..', '..', 'public', 'data');
const FONTS = join(import.meta.dirname, '..', '..', 'src', 'styles', 'fonts');
const SRC = join(import.meta.dirname, '..', '..', 'src');

/** Budzet iz SPEC §9.5, za sva tri reza zajedno. */
const BUDGET = 32 * 1024;

const subset = new Set(await subsetCharacters());

function exists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Nedostajuci znakovi, ispisani s kodnom tockom da poruka bude upotrebljiva. */
function missing(text: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const ch of text) {
    if (!subset.has(ch))
      out.add(`${ch} (U+${ch.codePointAt(0)?.toString(16).toUpperCase() ?? '?'})`);
  }
  return [...out].sort();
}

/**
 * Emoji ne dolaze ni iz jednog latinicnog reza — share grid ih ispisuje sistemskim
 * fontom. Izvan su podskupa namjerno i ne smiju racunati kao rupa.
 */
function withoutEmoji(text: string): string[] {
  return [...text].filter((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    // Prijelom reda iz JSX teksta nije glif; od U+1F000 navise su emoji blokovi,
    // a ondje je cijeli share grid. Sve ispod toga — ukljucujuci ✦ i ✓ — mora biti u rezu.
    return cp >= 0x20 && cp < 0x1f000;
  });
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    if ((await stat(path)).isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

/**
 * Nizovi koje kod moze ispisati: string literali, template literali i JSX tekst.
 *
 * Parsira se TypeScriptovim vlastitim parserom, ne regexom — komentari su puni
 * hrvatske proze i strelica, a oni se nikad ne ispisuju.
 */
function literalText(source: string, file: string): string {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let out = '';
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out += node.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe('skup znakova', () => {
  it('pokriva sva imena drzava', async () => {
    const path = join(DATA, 'world-meta.json');
    expect(exists(path), 'pokreni `pnpm data` prije testa').toBe(true);

    const meta = JSON.parse(await readFile(path, 'utf8')) as { countries: { name: string }[] };
    expect(meta.countries.length).toBeGreaterThan(150);
    expect(missing(meta.countries.map((c) => c.name).join(''))).toEqual([]);
  });

  it('pokriva sva imena naselja, u obje razine', async () => {
    const path = join(DATA, 'hr-places.json');
    expect(exists(path), 'pokreni `pnpm data` prije testa').toBe(true);

    const places = JSON.parse(await readFile(path, 'utf8')) as {
      gradovi: { name: string }[];
      mjesta: { name: string }[];
    };
    const names = [...places.gradovi, ...places.mjesta].map((p) => p.name).join('');
    expect(names).toMatch(/[čćđšž]/);
    expect(missing(names)).toEqual([]);
  });

  it('pokriva i aliase, jer se ispisuju u listi pokusaja', async () => {
    const path = join(DATA, 'aliases.json');
    expect(exists(path), 'pokreni `pnpm data` prije testa').toBe(true);

    const aliases = JSON.parse(await readFile(path, 'utf8')) as Record<string, string>;
    expect(missing(Object.keys(aliases).join('') + Object.values(aliases).join(''))).toEqual([]);
  });

  it('pokriva svaki niz koji sucelje moze ispisati', async () => {
    const files = (await walk(SRC)).filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(20);

    const text = files.map((f) => literalText(readFileSync(f, 'utf8'), f)).join('');
    expect(text).toMatch(/Hrvatska/);
    expect(missing(withoutEmoji(text))).toEqual([]);
  });

  it('nosi hrvatske dijakritike u oba slova', () => {
    expect(missing('čćđšžČĆĐŠŽ')).toEqual([]);
  });

  it('nosi znakove koje crta engine, ne prevodilac', () => {
    // Strelice smjera iz engine/distance.ts, oznaka pogotka i kvacica iz lige,
    // te tocke za „jos nije odigrao".
    expect(missing('↑↗→↘↓↙←↖✦✓⋯')).toEqual([]);
  });

  it('nosi oba razmaka iz SPEC §2.3', () => {
    // Pisani kodnom tockom jer su u izvoru nevidljivi: tanki razmak je
    // razdjelnik tisucica, nedjeljivi drzi broj i jedinicu u istom retku.
    const spaces = [0x2009, 0x00a0].map((cp) => String.fromCodePoint(cp));
    expect(missing(spaces)).toEqual([]);
  });

  it('nosi cijeli ispisivi ASCII zbog slobodno upisanih nadimaka', () => {
    const ascii = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i));
    expect(missing(ascii)).toEqual([]);
  });

  it('bez ponavljanja i stabilno sortiran', async () => {
    // Redoslijed ulazi u podskup, a podskup u hash imena datoteke: nestabilan
    // poredak znacio bi novi asset pri svakom `pnpm data`.
    const chars = await subsetCharacters();
    expect(new Set(chars).size).toBe(chars.length);
    expect([...chars]).toEqual([...chars].sort());
  });
});

describe('generirani rezovi', () => {
  const cuts = ['body-latin.woff2', 'body-latin-ext.woff2', 'display.woff2'];
  const built = cuts.every((c) => exists(join(FONTS, c)));

  it('postoje sva tri reza', () => {
    expect(built, 'pokreni `pnpm data` prije testa').toBe(true);
  });

  it.skipIf(!built)('svaki je stvarni woff2', () => {
    for (const cut of cuts) {
      // woff2 pocinje potpisom "wOF2"; woff1 bi bio "wOFF" i preglednik bi ga
      // odbio uz `format('woff2')` u fonts.css.
      expect(readFileSync(join(FONTS, cut)).toString('ascii', 0, 4), cut).toBe('wOF2');
    }
  });

  it.skipIf(!built)('sva tri zajedno stanu u budzet iz §9.5', () => {
    const total = cuts.reduce((sum, cut) => sum + readFileSync(join(FONTS, cut)).byteLength, 0);
    expect(total, `${String(Math.round(total / 1024))} KB`).toBeLessThanOrEqual(BUDGET);
  });

  it.skipIf(!built)('naslovni rez je bitno manji od reza tijela', () => {
    // Wordmark ispisuje pet glifova; da nije tako, pinanje osi nije proradilo.
    const display = readFileSync(join(FONTS, 'display.woff2')).byteLength;
    const body = readFileSync(join(FONTS, 'body-latin.woff2')).byteLength;
    expect(display).toBeLessThan(body / 4);
  });
});
