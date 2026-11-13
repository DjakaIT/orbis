/**
 * Deterministicka dnevna meta. SPEC §5.2.
 *
 * Ista datoteka, isti datum, isti mod → isti indeks na svakom uredaju. Bez ovoga
 * dva igraca dobiju razlicite mete i liga nema smisla.
 */

import { addDays, daysBetween, type DateString } from './time';

/** Ne mijenjati nakon pustanja u rad — pomice sve buduce mete. SPEC §5.2. */
const SALT = 'orbis-v1';

/**
 * Koliko dana unatrag meta ne smije ponoviti. SPEC §5.2.
 *
 * Jamstvo vrijedi za bazene od barem `2 * NO_REPEAT_DAYS`. Ispod toga se kosi
 * sa samim sobom: ako svaka meta mora doci na red jednom u `N` dana, a razmak
 * mora biti veci od 30, onda se nijedna meta ne smije pomaknuti unaprijed za
 * vise od `N - 30` mjesta — pri `N = 31` to dopusta samo identitet, dakle isti
 * poredak svaki krug. Stvarni bazeni su 71, 177 i 624, svi daleko iznad granice;
 * mjereno, najmanji razmak pri 71 je 34 dana.
 */
const NO_REPEAT_DAYS = 30;

/**
 * Prvi dan niza meta. Nepromjenjiv kao SALT — pomak bi razbacao sve mete.
 */
const EPOCH: DateString = '2026-01-01';

/**
 * Tri neovisna bazena meta. Svaki ima svoj niz, svoju partiju i svoj streak.
 * Glavni gradovi su odvojen mod, ne tezina moda svijet — meta je grad, ne drzava.
 */
export type Mode = 'world' | 'capitals' | 'hr';

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Jedan krug kroz cijeli bazen, promijesan deterministicki.
 *
 * Fisher–Yates unatrag, uz mulberry32 sijan iz `${mode}:${SALT}:${cycle}`. Isti
 * krug daje isti niz na svakom uredaju i u svakom pokretanju.
 */
function shuffled(mode: Mode, poolSize: number, cycle: number): number[] {
  return shuffle(`${mode}:${SALT}:${String(cycle)}:${String(poolSize)}`, poolSize);
}

/** Fisher–Yates unatrag nad `0 … size-1`, sijan iz zadanog niza znakova. */
function shuffle(seed: string, size: number): number[] {
  const random = mulberry32(xmur3(seed)());
  const out = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

const cache = new Map<string, number[]>();

function raw(mode: Mode, poolSize: number, cycle: number): number[] {
  const key = `${mode}:${String(poolSize)}:${String(cycle)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const out = shuffled(mode, poolSize, cycle);
  cache.set(key, out);
  return out;
}

/**
 * Prvi krug koji se ne podesava. Nema prethodnika na koji bi se osvrnuo, pa je
 * dno lanca — dovoljno prije epohe da ga nijedan stvarni datum ne dosegne.
 */
const FIRST_CYCLE = -2;

/**
 * Poredak jednog kruga, uz jamstvo od 30 dana preko granice kruga.
 *
 * Unutar kruga se meta ne moze ponoviti — svaka je u nizu tocno jednom. Jedini
 * rizik je prijelaz: drzava koja zatvara jedan krug mogla bi otvoriti sljedeci.
 * Zato se pocetnih 30 mjesta ociste od svega sto je bilo u zadnjih 30 dana
 * prethodnog kruga, zamjenom s kasnijim mjestom u istom krugu.
 *
 * Rep se cita iz **podesenog** poretka prethodnog kruga, ne iz sirovog. Sirovi
 * je bio prva verzija ovoga i bio je kriv: zamjena u prethodnom krugu premjesti
 * clana u njegovih zadnjih 30 dana, pa ga sirovi rep ne vidi. Test s bazenom od
 * 60 to je odmah pokazao — razmak od 21 dana.
 */
function order(mode: Mode, poolSize: number, cycle: number): number[] {
  // Bazen manji od prozora ne moze zadovoljiti jamstvo ni u principu.
  if (poolSize <= NO_REPEAT_DAYS) return raw(mode, poolSize, cycle);

  const key = (c: number): string => `order:${mode}:${String(poolSize)}:${String(c)}`;

  const known = cache.get(key(cycle));
  if (known) return known;

  /*
   * Lanac se gradi od dna prema trazenom krugu, ne rekurzijom. Svaki je krug
   * `poolSize` dana, pa je i deset godina nakon epohe ovo dvadesetak koraka.
   */
  let start = cycle;
  while (start > FIRST_CYCLE && !cache.has(key(start - 1))) start--;

  for (let c = start; c <= cycle; c++) {
    if (cache.has(key(c))) continue;

    const out = [...raw(mode, poolSize, c)];
    if (c > FIRST_CYCLE) {
      const previous = cache.get(key(c - 1)) ?? raw(mode, poolSize, c - 1);
      clearHead(out, new Set(previous.slice(-NO_REPEAT_DAYS)));
    }
    cache.set(key(c), out);
  }

  const built = cache.get(key(cycle));
  if (!built) throw new Error('Poredak kruga nije izgraden');
  return built;
}

/**
 * Prvih 30 mjesta kruga ocisti od svega iz `tail`, zamjenom s prvim kasnijim
 * mjestom koje u `tail` nije. Mijenja `out` na mjestu.
 */
function clearHead(out: number[], tail: ReadonlySet<number>): void {
  for (let i = 0; i < NO_REPEAT_DAYS; i++) {
    const value = out[i];
    if (value === undefined || !tail.has(value)) continue;

    for (let j = NO_REPEAT_DAYS; j < out.length; j++) {
      const candidate = out[j];
      if (candidate === undefined || tail.has(candidate)) continue;
      out[i] = candidate;
      out[j] = value;
      break;
    }
  }
}

/**
 * Indeks danasnje mete u bazenu te velicine.
 *
 * Niz je slijed krugova kroz cijeli bazen: u `poolSize` dana svaka meta dode na
 * red tocno jednom, pa nijedna drzava ne moze ispasti iz igre. Prije ovoga meta
 * se birala hashom po danu uz izbjegavanje ponavljanja, a to je u prvih 177 dana
 * pokazalo tek 119 od 177 drzava — 58 ih se nije pojavilo nijednom, dok su se
 * druge vrtjele po tri puta. Vidi DECISIONS.md.
 *
 * Racun je cist i ne ovisi o lokalnoj povijesti igraca, pa svi klijenti za isti
 * dan dobiju isti indeks.
 */
export function dailyTarget(date: DateString, mode: Mode, poolSize: number): number {
  if (poolSize < 1) throw new Error('Bazen meta je prazan');

  const day = daysBetween(EPOCH, date);
  // `floor` i ostatak s predznakom drze niz neprekinutim i prije EPOCH-a.
  const cycle = Math.floor(day / poolSize);
  const position = ((day % poolSize) + poolSize) % poolSize;

  const index = order(mode, poolSize, cycle)[position];
  if (index === undefined) throw new Error('Poredak kruga je krivo duljine');
  return index;
}

/* ------------------------------------------------------------ bazeni s datumom */

/**
 * Bazen meta koji vrijedi od zadanog dana.
 *
 * Bazen se nakon puštanja u rad ne smije promijeniti na mjestu: niz meta je
 * permutacija nad njegovom veličinom, pa bi svaka promjena pomaknula sve buduće
 * mete — i današnju, usred dana. Promjena se zato uvodi kao **novi bazen s
 * datumom početka**. Do tog dana vrijedi stari i niz se ne mijenja ni za jedan
 * dan; od tog dana vrijedi novi, sa svojim nizom.
 */
export interface Pool {
  /** Prvi dan u kojem ovaj bazen vrijedi. Prvi bazen počinje na `EPOCH`. */
  from: DateString;
  /**
   * Mjesta u bazenu, kao indeksi u popisu za pogađanje. Niz meta bira
   * **poziciju** u ovom nizu, pa je poredak dio bazena i ne smije se mijenjati.
   */
  ids: readonly number[];
}

export { EPOCH };

/** Bazen koji vrijedi na zadani dan: zadnji čiji je početak na taj dan ili prije. */
function poolIndexFor(pools: readonly Pool[], date: DateString): number {
  if (pools.length === 0) throw new Error('Nema bazena meta');
  let k = 0;
  for (let i = 1; i < pools.length; i++) {
    const p = pools[i];
    const before = pools[i - 1];
    if (!p || !before || p.from <= before.from)
      throw new Error('Bazeni moraju ići redom po datumu');
    if (p.from <= date) k = i;
  }
  return k;
}

/**
 * Indeks današnje mete u popisu za pogađanje.
 *
 * Prvi bazen ide točno starim računom (`dailyTarget` od `EPOCH`), pa je niz do
 * prvog prijelaza isti onaj koji je igra uvijek imala. Svaki kasniji bazen ima
 * vlastiti niz koji kreće od svog prvog dana, i isto jamstvo: u `N` dana svaka
 * meta jednom, i nijedna dvaput unutar 30 dana — **ni preko samog prijelaza**,
 * jer se prvih 30 dana novog bazena očisti od svega što je stari dao u svojih
 * zadnjih 30.
 */
export function targetFor(date: DateString, mode: Mode, pools: readonly Pool[]): number {
  const k = poolIndexFor(pools, date);
  const pool = pools[k];
  if (!pool || pool.ids.length < 1) throw new Error('Bazen meta je prazan');

  const position =
    k === 0
      ? dailyTarget(date, mode, pool.ids.length)
      : poolPosition(daysBetween(pool.from, date), mode, pools, k);

  const id = pool.ids[position];
  if (id === undefined) throw new Error('Poredak kruga je krivo duljine');
  return id;
}

function poolPosition(day: number, mode: Mode, pools: readonly Pool[], k: number): number {
  const pool = pools[k];
  if (!pool) throw new Error('Nema bazena');
  const size = pool.ids.length;
  const cycle = Math.floor(day / size);
  const position = day % size;
  const index = poolOrder(mode, pools, k, cycle)[position];
  if (index === undefined) throw new Error('Poredak kruga je krivo duljine');
  return index;
}

/**
 * Poredak jednog kruga kasnijeg bazena. Isti postupak kao `order`, s dvije
 * razlike: sjeme nosi datum početka bazena, pa dva bazena iste veličine nemaju
 * isti niz, a krug 0 se čisti od repa **prethodnog bazena**, ne prethodnog kruga.
 */
function poolOrder(mode: Mode, pools: readonly Pool[], k: number, cycle: number): number[] {
  const pool = pools[k];
  if (!pool) throw new Error('Nema bazena');
  const size = pool.ids.length;
  const key = (c: number): string => `pool:${mode}:${pool.from}:${String(size)}:${String(c)}`;

  const known = cache.get(key(cycle));
  if (known) return known;

  let start = cycle;
  while (start > 0 && !cache.has(key(start - 1))) start--;

  for (let c = start; c <= cycle; c++) {
    if (cache.has(key(c))) continue;

    const out = shuffle(`${mode}:${SALT}:${pool.from}:${String(c)}:${String(size)}`, size);

    if (size > NO_REPEAT_DAYS) {
      if (c === 0) clearHead(out, previousTail(mode, pools, k));
      else clearHead(out, new Set((cache.get(key(c - 1)) ?? []).slice(-NO_REPEAT_DAYS)));
    }
    cache.set(key(c), out);
  }

  const built = cache.get(key(cycle));
  if (!built) throw new Error('Poredak kruga nije izgraden');
  return built;
}

/**
 * Pozicije u bazenu `k` onih mjesta koja je prethodni bazen dao kao metu u
 * zadnjih 30 dana prije početka bazena `k`. Ono čega u novom bazenu nema ne
 * smeta i preskače se.
 */
function previousTail(mode: Mode, pools: readonly Pool[], k: number): Set<number> {
  const pool = pools[k];
  if (!pool || k === 0) return new Set();
  const position = new Map(pool.ids.map((id, i) => [id, i]));
  const tail = new Set<number>();
  for (let d = 1; d <= NO_REPEAT_DAYS; d++) {
    const id = targetFor(addDays(pool.from, -d), mode, pools.slice(0, k));
    const p = position.get(id);
    if (p !== undefined) tail.add(p);
  }
  return tail;
}
