import { useState } from 'react';

import { shareText } from '../engine/share';
import { useGame } from '../state/context';
import styles from './ShareSheet.module.css';

export default function ShareSheet() {
  const { state } = useGame();
  const [copied, setCopied] = useState(false);

  if (!state.solved) return null;

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
    <div className={styles.wrap}>
      <pre className={styles.preview}>{text}</pre>
      <button type="button" className={styles.button} onClick={() => void copy()}>
        {copied ? 'Kopirano' : 'Podijeli'}
      </button>
    </div>
  );
}
