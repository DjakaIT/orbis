import styles from './Header.module.css';

/** Wordmark lijevo, mod desno, hairline ispod. SPEC §2.4. */
export default function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className={styles.header}>
      <span className={styles.wordmark}>Orbis</span>
      {children}
    </header>
  );
}
