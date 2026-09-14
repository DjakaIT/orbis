import Globe from './components/Globe';
import GuessInput from './components/GuessInput';
import GuessList from './components/GuessList';
import Header from './components/Header';
import ShareSheet from './components/ShareSheet';
import { useGame } from './state/context';
import { GameProvider } from './state/GameContext';
import styles from './App.module.css';

export default function App() {
  return (
    <GameProvider mode="world">
      <Board />
    </GameProvider>
  );
}

function Board() {
  const { state } = useGame();

  return (
    <div className={styles.shell}>
      <Header>
        <span className={styles.modes}>Svijet</span>
      </Header>

      <main className={styles.body}>
        <Globe />

        {state.status === 'error' && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}

        <div className={styles.panel}>
          <GuessInput />
          <GuessList />
          <ShareSheet />
        </div>
      </main>

      <footer className={styles.footer}>Podaci: Natural Earth, DGU, GeoNames</footer>
    </div>
  );
}
