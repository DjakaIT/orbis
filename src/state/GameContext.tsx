/** Provider igre. React kontekst + `useReducer` — nema Reduxa. SPEC §1. */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { loadWorld } from '../data/load';
import { match, type SearchIndex } from '../engine/search';
import { now, zagrebDate } from '../engine/time';
import type { HrGeometry } from '../render/mapHR';
import type { Mode, Persisted, Place, Tier } from '../types';
import { GameCtx, type GameValue } from './context';
import { load, patch } from './persist';
import { initialState, reducer, toRound } from './reducer';

/** Sve što jedan mod treba da bi se odigrao. */
interface Loaded {
  mode: Mode;
  places: Place[];
  index: SearchIndex;
  /** Svijet ide preko prebuildane matrice; naselja su točke pa haversine dostaje. */
  matrix: Uint16Array | null;
  shapes: Map<string, GeoJSON.Geometry> | null;
  geometry: HrGeometry | null;
}

async function loadMode(mode: Mode, tier: Tier): Promise<Loaded> {
  if (mode === 'world') {
    const d = await loadWorld();
    return {
      mode,
      places: d.places,
      index: d.index,
      matrix: d.matrix,
      shapes: d.shapes,
      geometry: null,
    };
  }

  /*
   * Dinamički import, ne statički: hrvatski podaci i `d3-geo` idu u zaseban
   * chunk koji se dohvaća tek kad igrač odabere mod. SPEC §10, faza 2.
   */
  const { loadHr } = await import('./../data/loadHr');
  const d = await loadHr(tier);
  return {
    mode,
    places: d.places,
    index: d.index,
    matrix: null,
    shapes: null,
    geometry: d.geometry,
  };
}

/** Spremljena partija vrijedi samo za svoj mod i, u Hrvatskoj, svoju razinu. */
function roundFor(p: Persisted, mode: Mode, tier: Tier) {
  if (mode === 'world') return p.world;
  return p.hr?.tier === tier ? p.hr : null;
}

interface ProviderProps {
  mode: Mode;
  tier: Tier;
  children: ReactNode;
}

export function GameProvider({ mode, tier, children }: ProviderProps) {
  // Jedno čitanje pohrane po sesiji; dalje je reducer izvor istine za partiju.
  const [initial] = useState<Persisted>(load);
  const persisted = useRef<Persisted>(initial);

  const [date] = useState(zagrebDate);
  const [state, dispatch] = useReducer(reducer, initial, (p) => initialState(p, mode, date));
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    // Provider se remounta pri promjeni moda (`key={mode}` u App.tsx), pa je
    // stanje vec svjeze — nema sto resetirati.
    let alive = true;

    loadMode(mode, tier).then(
      (data) => {
        if (!alive) return;
        setLoaded(data);
        dispatch({
          type: 'loaded',
          data: { places: data.places, matrix: data.matrix, n: data.places.length },
          // Druga razina je drugi bazen: indeksi iz nje ne znace nista ovdje.
          round: roundFor(persisted.current, mode, tier),
          now: now(),
        });
      },
      (err: unknown) => {
        if (!alive) return;
        dispatch({
          type: 'error',
          message: err instanceof Error ? err.message : 'Podaci se nisu učitali',
        });
      },
    );

    return () => {
      alive = false;
    };
  }, [mode, tier]);

  // Svaka promjena partije ide u pohranu odmah — refresh ne smije pojesti potez.
  useEffect(() => {
    if (state.status !== 'ready') return;
    // patch, ne save: ligu pise drugi dio aplikacije u isti kljuc.
    persisted.current = patch({
      ...(mode === 'world' ? { world: toRound(state) } : { hr: { ...toRound(state), tier } }),
      stats: state.stats,
      prefs: { sortBy: state.sortBy },
    });
  }, [state, mode, tier]);

  const guess = useCallback(
    (input: string): boolean => {
      if (!loaded) return false;
      const id = match(input, loaded.index);
      if (id === null) {
        dispatch({ type: 'unknown', input });
        return false;
      }
      dispatch({ type: 'guess', id, now: now() });
      return true;
    },
    [loaded],
  );

  const setSort = useCallback((by: 'distance' | 'time') => {
    dispatch({ type: 'sort', by });
  }, []);

  const value = useMemo<GameValue>(
    () => ({
      state,
      guess,
      setSort,
      index: loaded?.index ?? null,
      shapes: loaded?.shapes ?? null,
      geometry: loaded?.geometry ?? null,
      places: loaded?.places ?? null,
    }),
    [state, guess, setSort, loaded],
  );

  return <GameCtx value={value}>{children}</GameCtx>;
}
