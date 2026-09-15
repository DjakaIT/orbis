import { lazy, Suspense, useState } from 'react';

import GuessInput from './components/GuessInput';
import GuessList from './components/GuessList';
import Header from './components/Header';
import ModeToggle from './components/ModeToggle';
import ShareSheet from './components/ShareSheet';
import TierToggle from './components/TierToggle';
import { readDeepLink } from './league/client';
import { useGame } from './state/context';
import { GameProvider } from './state/GameContext';
import { load } from './state/persist';
import type { Mode, Tier } from './types';
import styles from './App.module.css';

/**
 * Globus nosi three.js — 126 KB gzipano, i to je najveći pojedinačni trošak
 * glavne dretve pri učitavanju. Odgoda ga skida s kritične putanje: polje za
 * unos je spremno prije nego što se WebGL uopće inicijalizira, a globus upada
 * u isti okvir koji mu i inače drži mjesto.
 */
const Globe = lazy(() => import('./components/Globe'));

/** Karta Hrvatske i `d3-geo` idu u chunk koji se dohvaća tek pri odabiru moda. */
const MapHR = lazy(() => import('./components/MapHR'));

/** Liga je neobavezna — njezin kod se dohvaća tek kad se panel otvori. */
const League = lazy(() => import('./components/league/League'));

export default function App() {
  const [mode, setMode] = useState<Mode>('world');
  const [tier, setTier] = useState<Tier>(() => load().hr?.tier ?? 'gradovi');

  /*
   * `key` remounta providera pri svakoj promjeni moda ili razine. Bez toga bi
   * efekt koji sprema partiju stigao prije nego što se novi bazen učita i
   * žigosao staru partiju novom razinom — pa bi se pokušaji iz „gradova"
   * pojavili u „mjestima", gdje ti indeksi znače druga naselja.
   */
  return (
    <GameProvider key={`${mode}-${tier}`} mode={mode} tier={tier}>
      <Board mode={mode} onMode={setMode} tier={tier} onTier={setTier} />
    </GameProvider>
  );
}

interface BoardProps {
  mode: Mode;
  onMode: (m: Mode) => void;
  tier: Tier;
  onTier: (t: Tier) => void;
}

function Board({ mode, onMode, tier, onTier }: BoardProps) {
  const { state } = useGame();
  const [leagueOpen, setLeagueOpen] = useState(() => readDeepLink() !== null);

  return (
    <div className={styles.shell}>
      <Header>
        <ModeToggle mode={mode} onChange={onMode} />
      </Header>

      <main className={styles.body}>
        <div className={styles.stage}>
          <Suspense fallback={<div className={styles.stagePlaceholder} />}>
            {mode === 'world' ? <Globe /> : <MapHR />}
          </Suspense>
        </div>

        {state.status === 'error' && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}

        <div className={styles.panel}>
          {mode === 'hr' && <TierToggle tier={tier} onChange={onTier} />}
          <GuessInput />
          <GuessList />
          <ShareSheet />

          {leagueOpen && (
            <Suspense fallback={null}>
              <div className={styles.league}>
                <League />
              </div>
            </Suspense>
          )}
        </div>
      </main>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.leagueToggle}
          aria-expanded={leagueOpen}
          onClick={() => {
            setLeagueOpen((open) => !open);
          }}
        >
          {leagueOpen ? 'Sakrij ligu' : 'Liga'}
        </button>
        <span>Podaci: Natural Earth, DGU, GeoNames</span>
      </footer>
    </div>
  );
}
