/**
 * Kontekst igre, odvojen od providera.
 *
 * Provider je komponenta, ovo nije — drže se u zasebnim datotekama da Fast
 * Refresh radi (`react-refresh/only-export-components`).
 */

import { createContext, use } from 'react';

import type { SearchIndex } from '../engine/search';
import type { HrGeometry } from '../render/mapHR';
import type { Place } from '../types';
import type { GameState } from './reducer';

export interface GameValue {
  state: GameState;
  /** Pokušaj pogotka iz teksta. Vraća `false` ako ime nije prepoznato. */
  guess: (input: string) => boolean;
  setSort: (by: 'distance' | 'time') => void;
  /** Indeks pretrage za autocomplete; `null` dok se podaci učitavaju. */
  index: SearchIndex | null;
  /** Geometrije granica za teksturu globusa; null u modu Hrvatska. */
  shapes: Map<string, GeoJSON.Geometry> | null;
  /** Obris i županije za kartu Hrvatske; null u modu svijet. */
  geometry: HrGeometry | null;
  places: Place[] | null;
}

export const GameCtx = createContext<GameValue | null>(null);

export function useGame(): GameValue {
  const ctx = use(GameCtx);
  if (!ctx) throw new Error('useGame izvan <GameProvider>');
  return ctx;
}
