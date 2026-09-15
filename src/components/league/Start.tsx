import { useState } from 'react';

import styles from './League.module.css';

/**
 * Početak lige: dva gumba i ništa više.
 *
 * Prije su ovdje stajala dva obrasca, oba s poljem koje treba ispuniti prije
 * nego se išta dogodi — a za šestero prijatelja ime lige nije podatak nego
 * prepreka. Sada „Napravi ligu" odmah vraća kod, a polje za kod se pokaže tek
 * kad netko kaže da ga ima.
 */
export default function Start({
  busy,
  error,
  onCreate,
  onJoin,
}: {
  busy: boolean;
  error: string | null;
  onCreate: () => void;
  onJoin: (code: string) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');

  return (
    <div className={styles.panel}>
      {joining ? (
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length === 6) onJoin(code.trim().toUpperCase());
          }}
        >
          <input
            className={`${styles.input} ${styles.code}`}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
            }}
            placeholder="Kod"
            aria-label="Kod lige"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            // Kod se diktira i odmah upisuje; fokus mu ide sam.
            autoFocus
          />
          <button type="submit" className={styles.button} disabled={busy || code.trim().length < 6}>
            {busy ? 'Čekaj' : 'Uđi'}
          </button>
        </form>
      ) : (
        <div className={styles.choice}>
          <button type="button" className={styles.button} disabled={busy} onClick={onCreate}>
            {busy ? 'Čekaj' : 'Napravi ligu'}
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => {
              setJoining(true);
            }}
          >
            Imam kod
          </button>
        </div>
      )}

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
