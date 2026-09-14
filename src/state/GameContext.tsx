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

import { loadWorld, type WorldData } from '../data/load';
import { match } from '../engine/search';
import { now, zagrebDate } from '../engine/time';
import type { Mode, Persisted } from '../types';
import { GameCtx, type GameValue } from './context';
import { load, save } from './persist';
import { initialState, reducer, toRound } from './reducer';

export function GameProvider({ mode = 'world', children }: { mode?: Mode; children: ReactNode }) {
  // Jedno čitanje pohrane po sesiji; dalje je reducer izvor istine za partiju.
  const [initial] = useState<Persisted>(load);
  const persisted = useRef<Persisted>(initial);

  const [date] = useState(zagrebDate);
  const [state, dispatch] = useReducer(reducer, initial, (p) => initialState(p, mode, date));
  const [world, setWorld] = useState<WorldData | null>(null);

  useEffect(() => {
    let alive = true;
    loadWorld().then(
      (data) => {
        if (!alive) return;
        setWorld(data);
        dispatch({
          type: 'loaded',
          data: { places: data.places, matrix: data.matrix, n: data.n },
          round: persisted.current[mode],
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
  }, [mode]);

  // Svaka promjena partije ide u pohranu odmah — refresh ne smije pojesti potez.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const next: Persisted = {
      ...persisted.current,
      [mode]: toRound(state),
      stats: state.stats,
      prefs: { sortBy: state.sortBy },
    };
    persisted.current = next;
    save(next);
  }, [state, mode]);

  const guess = useCallback(
    (input: string): boolean => {
      if (!world) return false;
      const id = match(input, world.index);
      if (id === null) {
        dispatch({ type: 'unknown', input });
        return false;
      }
      dispatch({ type: 'guess', id, now: now() });
      return true;
    },
    [world],
  );

  const setSort = useCallback((by: 'distance' | 'time') => {
    dispatch({ type: 'sort', by });
  }, []);

  const value = useMemo<GameValue>(
    () => ({
      state,
      guess,
      setSort,
      index: world?.index ?? null,
      shapes: world?.shapes ?? null,
      places: world?.places ?? null,
    }),
    [state, guess, setSort, world],
  );

  return <GameCtx value={value}>{children}</GameCtx>;
}
