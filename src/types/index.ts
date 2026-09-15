import type { Mode } from '../engine/seed';
import type { DateString } from '../engine/time';

export type { Mode };
export type { DateString };

/** Jedna meta u bazenu — drzava ili naselje. */
export interface Place {
  id: number;
  /** ISO3 za drzave, sifra naselja za Hrvatsku. */
  code: string;
  name: string;
  /** Centroid. Za drzave sluzi samo za smjer strelice, nikad za udaljenost. */
  lat: number;
  lon: number;
}

/** Odnos prema prethodnom pokusaju, kronoloski. */
export type Trend = 'first' | 'closer' | 'farther' | 'same';

/** Jedan pokusaj igraca. */
export interface Guess {
  /** Indeks u bazenu meta. */
  id: number;
  name: string;
  km: number;
  /** Azimut prema meti, 0–360°. */
  bearing: number;
  /** Redni broj pokusaja, od 1. */
  ordinal: number;
  /**
   * Je li ovo meta. Izvodi se iz indeksa, nikad iz `km === 0`: matrica nosi
   * udaljenost izmedu granica, pa je svaka susjedna drzava nula kilometara.
   */
  hit: boolean;
  /** Dijeli granicu s metom — nula kilometara, ali nije meta. */
  neighbour: boolean;
  /** Priblizava li se igrac meti u odnosu na prethodni pokusaj. */
  trend: Trend;
}

/** Stanje jedne partije, po modu. */
export interface Round {
  date: DateString;
  /** Indeksi pogodenih meta, kronoloski. */
  guesses: number[];
  solved: boolean;
  /** Kad je partija zapoceta, ms od epohe — za `elapsed_ms` u ligi. */
  startedAt: number;
}

export interface ModeStats {
  played: number;
  solved: number;
  streak: number;
  maxStreak: number;
  /** Raspodjela po broju pokusaja: indeks 0 = jedan pokusaj … indeks 7 = osam i vise. */
  dist: number[];
}

export interface Player {
  id: string;
  token: string;
  nickname: string;
}

/** Oblik zapisa u localStorage pod kljucem `orbis:v1`. SPEC §8. */
export interface Persisted {
  v: 1;
  world: Round | null;
  hr: (Round & { tier: Tier }) | null;
  stats: Record<Mode, ModeStats>;
  player: Player | null;
  lastLeagueCode: string | null;
  prefs: { sortBy: 'distance' | 'time' };
}

export type Tier = 'gradovi' | 'mjesta';
