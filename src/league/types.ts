/** Oblici koje vraća API lige. SPEC §7.5. */

import type { Mode } from '../types';

export interface StandingRow {
  rank: number;
  playerId: string;
  nickname: string;
  points: number;
  guesses: number;
  elapsedMs: number;
  playedToday: boolean;
}

export interface LeagueView {
  name: string;
  code: string;
  round_id: string;
  /** Trenutak zatvaranja runde, ms od epohe. */
  closes_at: number;
  /** Ljestvica po modu — modovi se boduju odvojeno i ne zbrajaju. */
  standings: Record<Mode, StandingRow[]>;
  everyone_done: boolean;
  /** Jesu li tuđi današnji rezultati otkriveni — istina tek kad igrač sam odigra. */
  revealed: boolean;
}

export interface ClosedRound {
  round_id: string;
  closed_at: string;
  results: Record<Mode, StandingRow[]>;
}

export interface Me {
  player_id: string;
  nickname: string;
  leagues: { code: string; name: string }[];
}

export interface NewPlayer {
  player_id: string;
  token: string;
  nickname: string;
}

export interface NewLeague {
  league_id: string;
  code: string;
  name: string;
}

export interface ScoreResult {
  ok: boolean;
  round_id: string;
  round_closed: boolean;
}
