import { useState } from 'react';

import { flagSrc } from '../engine/flag';
import { shareText } from '../engine/share';
import { useGame } from '../state/context';
import { guessNoun } from '../engine/share';
import styles from './Result.module.css';

/**
 * Trenutak pogotka.
 *
 * Prije je pobjeda bila samo boja na globusu i redak s nulom kilometara — igrač
 * je morao zaključiti da je gotovo. Ovdje piše što je bila meta, iz koliko
 * pokušaja i koliki je niz, pa se pobjeda i vidi i pročita.
 */
export default function Result() {
  const { state, places } = useGame();
  const [copied, setCopied] = useState(false);

  if (!state.solved || state.target === null) return null;

  const target = places?.[state.target];
  const hit = state.guesses.find((g) => g.hit);
  const attempts = state.guesses.length;
  const stats = state.stats[state.mode];
  const text = shareText(state.date, state.guesses, state.mode);

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
    <section className={styles.card} aria-label="Rezultat">
      {/*
        Čitač ekrana dobiva rečenicu, ne niz odvojenih komadića. Namjerno bez
        `role="status"`: pogodak već objavljuje živo područje u listi pokušaja,
        a dva živa područja na isti događaj znače da se sve pročita dvaput.
      */}
      <p className={styles.sr}>
        Pogodak: {target?.name ?? ''}, iz {attempts} {guessNoun(attempts)}.
      </p>

      <div className={styles.crest} aria-hidden="true">
        {flagSrc(hit?.a2) ? (
          <img className={styles.flag} src={flagSrc(hit?.a2) ?? ''} alt="" width={72} height={54} />
        ) : (
          <span>✦</span>
        )}
      </div>

      <h2 className={styles.name} aria-hidden="true">
        {target?.name}
      </h2>

      <p className={styles.line} aria-hidden="true">
        Pogodak iz {attempts} {guessNoun(attempts)}
        {stats.streak > 1 && (
          <>
            <span className={styles.sep}>·</span>
            niz {stats.streak}
          </>
        )}
      </p>

      <div className={styles.share}>
        <pre className={styles.preview}>{text}</pre>
        <button type="button" className={styles.button} onClick={() => void copy()}>
          {copied ? 'Kopirano' : 'Podijeli'}
        </button>
      </div>
    </section>
  );
}
