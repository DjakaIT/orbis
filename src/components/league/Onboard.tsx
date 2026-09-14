import { useState } from 'react';

import styles from './League.module.css';

/**
 * Cijela registracija je: upiši nadimak. Bez emaila, lozinke, potvrde, OAutha,
 * captche. Osam sekundi, nijedan korak na kojem se može odustati. SPEC §7.2.
 */
export default function Onboard({
  joining = false,
  busy,
  error,
  onSubmit,
}: {
  /** Dolazi li igrač preko `/l/:code` — tad je ovo zadnji korak pridruživanja. */
  joining?: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (nickname: string) => void;
}) {
  const [nickname, setNickname] = useState('');

  return (
    <form
      className={styles.panel}
      onSubmit={(e) => {
        e.preventDefault();
        if (nickname.trim()) onSubmit(nickname.trim());
      }}
    >
      <p className={styles.lead}>
        {joining ? 'Pridružuješ se ligi. Kako da te zovemo?' : 'Kako da te zovemo?'}
      </p>

      <div className={styles.row}>
        <input
          className={styles.input}
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
          }}
          placeholder="Nadimak"
          aria-label="Nadimak"
          maxLength={24}
          autoComplete="nickname"
        />
        <button type="submit" className={styles.button} disabled={busy || !nickname.trim()}>
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
