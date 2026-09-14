/** Normalizacija unosa i fuzzy match. SPEC §4.5 i §5.4. */

/**
 * Unos svodi na golu latinicu bez dijakritika, malim slovima, bez razmaka.
 *
 * `Đ`/`đ` nema kombinirajući dijakritik u Unicodeu i `NFD` ga neće rastaviti —
 * mora se obraditi eksplicitno, prije `normalize('NFD')`.
 */
export function normalize(s: string): string {
  return s
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface SearchEntry {
  /** Indeks u bazenu meta. */
  id: number;
  /** Ime kako se prikazuje igraču. */
  name: string;
}

interface IndexedEntry extends SearchEntry {
  key: string;
}

export interface SearchIndex {
  entries: IndexedEntry[];
  /** Normalizirano ime ili alias → indeks u bazenu. */
  exact: Map<string, number>;
  /** Prva dva znaka → kandidati, za jeftin Levenshtein. */
  buckets: Map<string, IndexedEntry[]>;
}

/** Najviše prijedloga u autocompleteu. SPEC §5.4. */
export const MAX_SUGGESTIONS = 6;

/** Kraći unos od ovoga nikad ne razrješava prefiks — previše kandidata. */
const MIN_PREFIX = 3;

export function buildIndex(
  entries: SearchEntry[],
  aliases: Record<string, string> = {},
): SearchIndex {
  const indexed: IndexedEntry[] = entries.map((e) => ({ ...e, key: normalize(e.name) }));

  const exact = new Map<string, number>();
  for (const e of indexed) exact.set(e.key, e.id);

  // Aliasi pokazuju na prikazno ime; preslikavamo ih na isti indeks.
  const byName = new Map(indexed.map((e) => [e.key, e.id]));
  for (const [alias, target] of Object.entries(aliases)) {
    const id = byName.get(normalize(target));
    if (id !== undefined) exact.set(normalize(alias), id);
  }

  const buckets = new Map<string, IndexedEntry[]>();
  for (const e of indexed) {
    const b = e.key.slice(0, 2);
    const list = buckets.get(b);
    if (list) list.push(e);
    else buckets.set(b, [e]);
  }

  return { entries: indexed, exact, buckets };
}

/**
 * Tri koraka, prvi koji uspije pobjeđuje: točan pogodak, jedinstveni prefiks,
 * pa Levenshtein ≤ 1 nad kandidatima koji dijele prva dva znaka.
 */
export function match(input: string, index: SearchIndex): number | null {
  const q = normalize(input);
  if (!q) return null;

  const exact = index.exact.get(q);
  if (exact !== undefined) return exact;

  if (q.length >= MIN_PREFIX) {
    let only: number | null = null;
    for (const e of index.entries) {
      if (!e.key.startsWith(q)) continue;
      if (only !== null) {
        only = null;
        break;
      }
      only = e.id;
    }
    if (only !== null) return only;
  }

  // Samo kandidati s istim prvim dvama znakovima: ~20 usporedbi umjesto 6500.
  for (const e of index.buckets.get(q.slice(0, 2)) ?? []) {
    if (Math.abs(e.key.length - q.length) > 1) continue;
    if (withinOneEdit(q, e.key)) return e.id;
  }

  return null;
}

/** Prijedlozi za autocomplete: prvo oni koji počinju unosom, pa oni koji ga sadrže. */
export function suggest(input: string, index: SearchIndex, limit = MAX_SUGGESTIONS): SearchEntry[] {
  const q = normalize(input);
  if (!q) return [];

  const prefix: IndexedEntry[] = [];
  const contains: IndexedEntry[] = [];
  for (const e of index.entries) {
    if (e.key.startsWith(q)) prefix.push(e);
    else if (e.key.includes(q)) contains.push(e);
  }

  const byName = (a: SearchEntry, b: SearchEntry): number => a.name.localeCompare(b.name, 'hr');
  prefix.sort(byName);
  contains.sort(byName);

  return [...prefix, ...contains].slice(0, limit).map(({ id, name }) => ({ id, name }));
}

/**
 * Razlikuju li se nizovi za najviše jedno umetanje, brisanje ili zamjenu?
 * Rani izlaz čim se nađe druga razlika — nema pune matrice.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (short.length === long.length) i++;
    j++;
  }
  return true;
}
