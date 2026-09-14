import { zagrebWeekdayAt } from '../../engine/time';
import type { LeagueView } from '../../league/types';
import styles from './League.module.css';

/**
 * Ljestvica lige. SPEC §7.6.
 *
 * Kvačica pokazuje tko je danas odigrao — to je jedini podatak koji ekipu tjera
 * da zaigra. Tuđi današnji rezultati ostaju skriveni dok igrač sam ne odigra,
 * inače se iz broja pokušaja vidi je li zagonetka teška.
 */
export default function Standings({ view, meId }: { view: LeagueView; meId: string | null }) {
  return (
    <section className={styles.panel} aria-label={`Ljestvica lige ${view.name}`}>
      <header className={styles.head}>
        <span className={styles.name}>{view.name}</span>
        <span className={styles.closes}>{closesLabel(view.closes_at)}</span>
      </header>

      <ol className={styles.board}>
        {view.standings.map((row) => (
          <li
            key={row.playerId}
            className={`${styles.row} ${row.playerId === meId ? styles.me : ''}`.trim()}
          >
            <span className={styles.rank}>{row.rank}</span>
            <span className={styles.who}>{row.nickname}</span>
            <span className={styles.points}>{row.points}</span>
            <span className={styles.tries}>
              {row.guesses} {row.guesses === 1 ? 'pokušaj' : 'pokušaja'}
            </span>
            <span
              className={styles.today}
              aria-label={row.playedToday ? 'odigrao danas' : 'nije još'}
            >
              {row.playedToday ? '✓' : '⋯'}
            </span>
          </li>
        ))}
      </ol>

      {!view.revealed && (
        <p className={styles.note}>Tuđi današnji rezultati otključavaju se kad sam odigraš.</p>
      )}

      <p className={styles.share}>
        Pozovi ekipu: <code className={styles.codeText}>{view.code}</code>
      </p>
    </section>
  );
}

/** Indeks 0 je neiskorišten: `zagrebWeekdayAt` vraća 1 = ponedjeljak. */
const DAYS = [
  '',
  'u ponedjeljak',
  'u utorak',
  'u srijedu',
  'u četvrtak',
  'u petak',
  'u subotu',
  'u nedjelju',
];

/** „zatvara se u petak, 17:00" — dan u tjednu, pa sat. SPEC §7.6. */
function closesLabel(at: number): string {
  return `zatvara se ${DAYS[zagrebWeekdayAt(at)] ?? 'u petak'}, 17:00`;
}
