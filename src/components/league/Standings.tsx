import { zagrebWeekdayAt } from '../../engine/time';
import type { LeagueView, StandingRow } from '../../league/types';
import type { Mode } from '../../types';
import styles from './League.module.css';

/** Modovi se boduju odvojeno, pa svaki ima svoju ljestvicu i svoj naslov. */
const TABLES: { mode: Mode; label: string }[] = [
  { mode: 'world', label: 'Države' },
  { mode: 'capitals', label: 'Glavni gradovi' },
  { mode: 'hr', label: 'Hrvatska' },
];

/**
 * Ljestvica lige. SPEC §7.6.
 *
 * Tri odvojene ljestvice, jedna po modu. Prije je bila jedna sa zbrojem svih
 * modova, pa se iz retka nije vidjelo tko je u čemu bolji — pogodak iz glavnih
 * gradova vezao se uz pogodak iz država i ukupan broj nije značio ništa.
 *
 * Kvačica pokazuje tko je danas odigrao **taj mod** — to je jedini podatak koji
 * ekipu tjera da zaigra. Tuđi današnji rezultati ostaju skriveni dok igrač sam ne
 * odigra, inače se iz broja pokušaja vidi je li zagonetka teška.
 */
export default function Standings({ view, meId }: { view: LeagueView; meId: string | null }) {
  return (
    <section className={styles.panel} aria-label={`Ljestvica lige ${view.name}`}>
      <header className={styles.head}>
        <span className={styles.name}>{view.name}</span>
        <span className={styles.closes}>{closesLabel(view.closes_at)}</span>
      </header>

      {TABLES.map(({ mode, label }) => (
        <Table key={mode} label={label} rows={view.standings[mode] ?? []} meId={meId} />
      ))}

      {!view.revealed && (
        <p className={styles.note}>Tuđi današnji rezultati otključavaju se kad sam odigraš.</p>
      )}
    </section>
  );
}

function Table({ label, rows, meId }: { label: string; rows: StandingRow[]; meId: string | null }) {
  if (rows.length === 0) return null;

  return (
    <div className={styles.table}>
      <h3 className={styles.tableName}>{label}</h3>
      <ol className={styles.board}>
        {rows.map((row) => (
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
    </div>
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
