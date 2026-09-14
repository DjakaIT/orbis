import { distanceColor } from '../engine/color';
import { arrow, formatKm } from '../engine/distance';
import { useGame } from '../state/context';
import { sortedGuesses } from '../state/reducer';
import styles from './GuessList.module.css';

/**
 * Ocitanja. Imena lijevo, brojevi desno (tabular), strelice u fiksnoj koloni.
 *
 * Default je poredak po udaljenosti, najdalje gore — tako je najblizi pogodak
 * uvijek neposredno iznad inputa. SPEC §2.4.
 */
export default function GuessList() {
  const { state, setSort } = useGame();
  const rows = sortedGuesses(state);

  if (rows.length === 0) return null;

  const latest = state.guesses[state.guesses.length - 1];

  return (
    <section className={styles.wrap} aria-label="Pokušaji">
      <div className={styles.head}>
        <span>
          {state.guesses.length} {plural(state.guesses.length)}
        </span>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => {
            setSort(state.sortBy === 'distance' ? 'time' : 'distance');
          }}
        >
          {state.sortBy === 'distance' ? 'po udaljenosti' : 'kronološki'}
        </button>
      </div>

      {/* Udaljenost se objavljuje citacu ekrana, ne samo boji. SPEC §11.3 t. 8. */}
      <p className={styles.live} role="status" aria-live="polite">
        {latest
          ? `${latest.name}, ${formatKm(latest.km)}${latest.km === 0 ? ', pogodak' : ''}`
          : ''}
      </p>

      <ol className={styles.list}>
        {rows.map((g) => (
          <li key={g.id} className={styles.row}>
            {/* Jedina pojava gradijenta izvan karte — veze listu s globusom. */}
            <span
              className={styles.bar}
              style={{ background: distanceColor(g.km, state.mode) }}
              aria-hidden="true"
            />
            <span className={styles.name}>{g.name}</span>
            <span className={styles.km}>{formatKm(g.km)}</span>
            <span className={styles.arrow} aria-hidden="true">
              {arrow(g.bearing, g.km)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** „1 pokušaj", sve ostalo „pokušaja" — paukal i genitiv množine ovdje su isti. */
function plural(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? 'pokušaj' : 'pokušaja';
}
