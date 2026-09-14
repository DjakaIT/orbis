import { useState } from 'react';

import styles from './League.module.css';

/** Otvaranje nove lige. Vraća šestoznamenkasti kod koji se diktira preko telefona. */
export default function CreateLeague({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState('');

  return (
    <form
      className={styles.panel}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <p className={styles.lead}>Otvori ligu</p>
      <div className={styles.row}>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Ime lige"
          aria-label="Ime lige"
          maxLength={40}
        />
        <button type="submit" className={styles.button} disabled={busy || !name.trim()}>
          {busy ? 'Čekaj' : 'Otvori'}
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
