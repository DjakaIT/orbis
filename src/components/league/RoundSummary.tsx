import { useState } from 'react';

import type { ClosedRound } from '../../league/types';
import styles from './League.module.css';

/**
 * Konačna ljestvica zatvorene runde: pobjednik i gumb za dijeljenje u grupni
 * chat. SPEC §7.3 i §7.6.
 */
export default function RoundSummary({ round, name }: { round: ClosedRound; name: string }) {
  const [copied, setCopied] = useState(false);
  const winner = round.results[0];

  if (!winner) return null;

  const text = [
    `Orbis · ${name} · runda do ${croatianDate(round.round_id)}`,
    ...round.results.map((r) => `${String(r.rank)}. ${r.nickname} — ${String(r.points)}`),
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

      <p className={styles.winner}>
        Pobjednik: <span className={styles.winnerName}>{winner.nickname}</span> s {winner.points}{' '}
        bodova
      </p>

      <ol className={styles.board}>
        {round.results.map((r) => (
          <li key={r.playerId} className={styles.row}>
            <span className={styles.rank}>{r.rank}</span>
            <span className={styles.who}>{r.nickname}</span>
            <span className={styles.points}>{r.points}</span>
          </li>
        ))}
      </ol>

      <button type="button" className={styles.button} onClick={() => void copy()}>
        {copied ? 'Kopirano' : 'Podijeli'}
      </button>
    </section>
  );
}

function croatianDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${String(Number(day))}.${String(Number(month))}.`;
}
