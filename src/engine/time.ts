/**
 * Sve datumske granice su Europe/Zagreb, nikad UTC. SPEC §5.1.
 *
 * Ovo je jedini modul koji smije dodirnuti `Date` — ESLint to i provodi
 * (`no-restricted-globals` / `no-restricted-properties` u eslint.config.ts).
 */

const TZ = 'Europe/Zagreb';

/** Kalendarski dan bez vremena, u obliku "YYYY-MM-DD". */
export type DateString = string;

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const wallFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });

const WEEKDAYS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const MS_PER_DAY = 86_400_000;

/** "YYYY-MM-DD" za trenutni zagrebački dan. */
export function zagrebDate(d: Date = new Date()): DateString {
  return dayFmt.format(d);
}

/** Trenutak u milisekundama od epohe. Jedini dopušteni izvor `Date.now()`. */
export function now(): number {
  return Date.now();
}

/** Zagrebački sat, 0–23. */
export function zagrebHour(d: Date = new Date()): number {
  return wallClock(d).hour;
}

/** Zagrebački dan u tjednu: 1 = ponedjeljak … 7 = nedjelja. */
export function zagrebWeekday(d: Date = new Date()): number {
  const short = weekdayFmt.format(d);
  const n = WEEKDAYS[short];
  if (n === undefined) throw new Error(`Neočekivan dan u tjednu: ${short}`);
  return n;
}

/** Dan u tjednu za trenutak zadan u milisekundama od epohe. */
export function zagrebWeekdayAt(ms: number): number {
  return zagrebWeekday(new Date(ms));
}

/** Milisekunde do sljedeće zagrebačke ponoći — kad stiže nova zagonetka. */
export function msUntilNextPuzzle(d: Date = new Date()): number {
  const midnight = instantOfZagrebMidnight(addDays(zagrebDate(d), 1));
  return midnight - d.getTime();
}

/**
 * round_id = datum petka kojim runda ZAVRŠAVA, "YYYY-MM-DD". SPEC §7.3.
 *
 * Runda ide od petka 17:00 do sljedećeg petka 17:00, pa petak prije 17:00 još
 * pripada rundi koja se zatvara isti dan.
 */
export function roundIdFor(d: Date = new Date()): DateString {
  const today = zagrebDate(d);
  const weekday = zagrebWeekday(d);
  let untilFriday = (5 - weekday + 7) % 7;
  if (weekday === 5 && zagrebHour(d) >= 17) untilFriday = 7;
  return addDays(today, untilFriday);
}

/** Trenutak (ms od epohe) u kojem u Zagrebu nastupa 17:00 na zadani dan. */
export function roundClosesAt(roundId: DateString): number {
  return instantOfZagrebWallClock(roundId, 17);
}

/** Zadani datum pomaknut za `days` kalendarskih dana. Čista aritmetika nad danima. */
export function addDays(date: DateString, days: number): DateString {
  const [y, m, d] = splitDate(date);
  return formatDate(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Broj kalendarskih dana između dva datuma (`to - from`). */
export function daysBetween(from: DateString, to: DateString): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / MS_PER_DAY);
}

/**
 * `n` datuma koji prethode zadanom, najnoviji prvi.
 * Koristi se za determinističko izbjegavanje ponavljanja meta. SPEC §5.2.
 */
export function lastNDates(date: DateString, n: number): DateString[] {
  const out: DateString[] = [];
  for (let i = 1; i <= n; i++) out.push(addDays(date, -i));
  return out;
}

/** Je li datum današnji ili jučerašnji zagrebački dan? Tolerancija oko ponoći. SPEC §7.5. */
export function isTodayOrYesterday(date: DateString, now: Date = new Date()): boolean {
  const today = zagrebDate(now);
  return date === today || date === addDays(today, -1);
}

/* ---------------------------------------------------------------- interno */

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(d: Date): WallClock {
  const parts = wallFmt.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Nedostaje dio datuma: ${type}`);
    return Number(part.value);
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Pomak zagrebačkog zidnog sata od UTC-a u zadanom trenutku, u milisekundama.
 * Ljeti +2 h, zimi +1 h — čitamo ga iz Intla umjesto da ga pretpostavljamo.
 */
function zagrebOffset(d: Date): number {
  const w = wallClock(d);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/**
 * Trenutak u kojem zagrebački zidni sat pokazuje zadani datum i sat.
 *
 * Pomak ovisi o trenutku koji tek tražimo, pa se dvaput iterira: prva procjena
 * koristi pomak u UTC-u, druga pomak u okolici rezultata. To je dovoljno za
 * svaki prijelaz na ljetno/zimsko vrijeme jer se pomak mijenja najviše jednom.
 */
function instantOfZagrebWallClock(date: DateString, hour: number): number {
  const [y, m, d] = splitDate(date);
  const target = Date.UTC(y, m - 1, d, hour);
  let guess = target - zagrebOffset(new Date(target));
  guess = target - zagrebOffset(new Date(guess));
  return guess;
}

function instantOfZagrebMidnight(date: DateString): number {
  return instantOfZagrebWallClock(date, 0);
}

function splitDate(date: DateString): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Neispravan datum: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function utcMidnight(date: DateString): number {
  const [y, m, d] = splitDate(date);
  return Date.UTC(y, m - 1, d);
}

function formatDate(d: Date): DateString {
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
