import { useState } from 'react';

import styles from './League.module.css';

/** Pridruživanje postojećoj ligi upisom koda. */
export default function JoinLeague({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState('');

  return (
    <form
      className={styles.panel}
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onSubmit(code.trim().toUpperCase());
      }}
    >
      <p className={styles.lead}>Pridruži se ligi</p>
      <div className={styles.row}>
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
        />
        <button type="submit" className={styles.button} disabled={busy || code.trim().length < 6}>
          {busy ? 'Čekaj' : 'Uđi'}
        </button>
      </div>
      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
