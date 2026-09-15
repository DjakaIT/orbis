/**
 * Deterministicka dnevna meta. SPEC §5.2.
 *
 * Ista datoteka, isti datum, isti mod → isti indeks na svakom uredaju. Bez ovoga
 * dva igraca dobiju razlicite mete i liga nema smisla.
 */

import { daysBetween, type DateString } from './time';

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

export type Mode = 'world' | 'hr';

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
  const random = mulberry32(xmur3(`${mode}:${SALT}:${String(cycle)}:${String(poolSize)}`)());
  const out = Array.from({ length: poolSize }, (_, i) => i);
  for (let i = poolSize - 1; i > 0; i--) {
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
      const tail = new Set(previous.slice(-NO_REPEAT_DAYS));

      for (let i = 0; i < NO_REPEAT_DAYS; i++) {
        const value = out[i];
        if (value === undefined || !tail.has(value)) continue;

        for (let j = NO_REPEAT_DAYS; j < poolSize; j++) {
          const candidate = out[j];
          if (candidate === undefined || tail.has(candidate)) continue;
          out[i] = candidate;
          out[j] = value;
          break;
        }
      }
    }
    cache.set(key(c), out);
  }

  const built = cache.get(key(cycle));
  if (!built) throw new Error('Poredak kruga nije izgraden');
  return built;
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
