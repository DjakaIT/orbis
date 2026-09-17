import { useState } from 'react';

import type { ClosedRound, StandingRow } from '../../league/types';
import type { Mode } from '../../types';
import styles from './League.module.css';

/** Isti redoslijed i nazivi kao u `Standings` — modovi se boduju odvojeno. */
const TABLES: { mode: Mode; label: string }[] = [
  { mode: 'world', label: 'Države' },
  { mode: 'capitals', label: 'Glavni gradovi' },
  { mode: 'hr', label: 'Hrvatska' },
];

/**
 * Konačna ljestvica zatvorene runde: pobjednik po modu i gumb za dijeljenje u
 * grupni chat. SPEC §7.3 i §7.6.
 *
 * Runda nema jednog pobjednika nego tri, jer se modovi ne zbrajaju.
 */
export default function RoundSummary({ round, name }: { round: ClosedRound; name: string }) {
  const [copied, setCopied] = useState(false);

  const played = TABLES.map((t) => ({ ...t, rows: round.results[t.mode] ?? [] })).filter(
    (t) => t.rows.length > 0,
  );

  if (played.length === 0) return null;

  const text = [
    `Orbis · ${name} · runda do ${croatianDate(round.round_id)}`,
    ...played.flatMap(({ label, rows }) => [
      '',
      label,
      ...rows.map((r) => `${String(r.rank)}. ${r.nickname} — ${String(r.points)}`),
    ]),
  ].join('\n');

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      globalThis.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Bez dopuštenja za međuspremnik tekst ostaje vidljiv za ručno kopiranje.
      setCopied(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="Završena runda">
      <header className={styles.head}>
        <span className={styles.name}>Runda zatvorena</span>
        <span className={styles.closes}>{croatianDate(round.round_id)}</span>
      </header>

      {played.map(({ mode, label, rows }) => (
        <div key={mode} className={styles.table}>
          <h3 className={styles.tableName}>{label}</h3>
          {winnerOf(rows) && (
            <p className={styles.winner}>
              Pobjednik: <span className={styles.winnerName}>{winnerOf(rows)?.nickname}</span> s{' '}
              {winnerOf(rows)?.points} bodova
            </p>
          )}
          <ol className={styles.board}>
            {rows.map((r) => (
              <li key={r.playerId} className={styles.row}>
                <span className={styles.rank}>{r.rank}</span>
                <span className={styles.who}>{r.nickname}</span>
                <span className={styles.points}>{r.points}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}

      <button type="button" className={styles.button} onClick={() => void copy()}>
        {copied ? 'Kopirano' : 'Podijeli'}
      </button>
    </section>
  );
}

function winnerOf(rows: StandingRow[]): StandingRow | undefined {
  return rows[0];
}

function croatianDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${String(Number(day))}.${String(Number(month))}.`;
}
