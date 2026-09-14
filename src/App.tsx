import styles from './App.module.css';

/**
 * Ljuska sučelja. Globus, unos i lista pogodaka dolaze u fazi 1 (SPEC §10);
 * ovdje stoji samo okvir koji dokazuje da tokeni i font rade.
 */
export default function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.wordmark}>Orbis</span>
        <span className={styles.modes}>Svijet · Hrvatska</span>
      </header>

      <main className={styles.body}>
        <p className={styles.note}>Dnevna geografska igra. Prva zagonetka stiže u fazi 1.</p>
      </main>

      <footer className={styles.footer}>Podaci: Natural Earth, DGU, GeoNames</footer>
    </div>
  );
}
