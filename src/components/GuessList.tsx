import { distanceColor, proximity } from '../engine/color';
import { flagSrc } from '../engine/flag';
import { arrow, formatKm } from '../engine/distance';
import { useGame } from '../state/context';
import { sortedGuesses } from '../state/reducer';
import type { Guess } from '../types';
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

      {/*
       * Ocitanje zadnjeg pokusaja, vidljivo i objavljeno citacu ekrana.
       * Brojka sama ne kaze je li igrac topliji nego prije, ni sto znaci nula
       * kilometara — a nula je granica, ne pogodak. SPEC §11.3 t. 8.
       */}
      {latest && (
        <p className={styles.live} role="status" aria-live="polite">
          <span className={styles.liveName}>{latest.name}</span>
          <span className={styles.liveSep} aria-hidden="true">
            ·
          </span>
          <span className={latest.hit ? styles.liveHit : undefined}>{verdict(latest)}</span>
          {!latest.hit && (
            <>
              <span className={styles.liveSep} aria-hidden="true">
                ·
              </span>
              {/* Kilometri su tocni, postotak je osjetljiv: koliko je to na ovoj skali. */}
              <span>{proximity(latest.km, state.mode)}% blizu</span>
            </>
          )}
          {latest.trend !== 'first' && !latest.hit && (
            <>
              <span className={styles.liveSep} aria-hidden="true">
                ·
              </span>
              <span>{TREND[latest.trend]}</span>
            </>
          )}
        </p>
      )}

      <ol className={styles.list}>
        {rows.map((g) => (
          <li key={g.id} className={styles.row}>
            {/* Jedina pojava gradijenta izvan karte — veze listu s globusom. */}
            <span
              className={styles.bar}
              style={{ background: distanceColor(g.km, state.mode, g.hit) }}
              aria-hidden="true"
            />
            {/*
              Zastava se cita brze od imena i kaze o kojoj je drzavi rijec.
              `alt` je prazan jer ime stoji odmah do nje — citac ekrana bi inace
              svaki redak procitao dvaput. Lijeno, jer ih se u partiji pokaze
              tek nekoliko.
            */}
            <span className={styles.flag}>
              {flagSrc(g.a2) && (
                <img src={flagSrc(g.a2) ?? ''} alt="" width={20} height={15} loading="lazy" />
              )}
            </span>
            <span className={styles.name}>{g.name}</span>
            <span className={g.neighbour ? styles.kmWord : styles.km}>
              {g.neighbour ? 'susjedna' : formatKm(g.km)}
            </span>
            <span className={styles.arrow} aria-hidden="true">
              {arrow(g.bearing, g.hit)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Sto se zapravo dogodilo: pogodak, susjed ili udaljenost. */
function verdict(g: Guess): string {
  if (g.hit) return 'pogodak';
  if (g.neighbour) return 'susjedna država, dijeli granicu s metom';
  return formatKm(g.km);
}

const TREND: Record<'closer' | 'farther' | 'same', string> = {
  closer: 'bliže nego prije',
  farther: 'dalje nego prije',
  same: 'jednako daleko',
};

/** „1 pokušaj", sve ostalo „pokušaja" — paukal i genitiv množine ovdje su isti. */
function plural(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? 'pokušaj' : 'pokušaja';
}
