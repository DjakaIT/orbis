import { useState } from 'react';

import styles from './League.module.css';
import GoogleSignIn from './GoogleSignIn';

/**
 * Cijela registracija je: upiši nadimak. Osam sekundi, nijedan korak na kojem se
 * može odustati. SPEC §7.2.
 *
 * Google prijava stoji **ispod** nadimka, ne iznad njega, i može je se preskočiti.
 * Ona rješava drugu stvar: nadimak nije lozinka, pa isti nadimak s novog uređaja
 * bude novi igrač. Tko se prijavi, isti je igrač svugdje.
 */
export default function Onboard({
  joining = false,
  busy,
  error,
  onSubmit,
  onGoogle,
}: {
  /** Dolazi li igrač preko `/l/:code` — tad je ovo zadnji korak pridruživanja. */
  joining?: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (nickname: string) => void;
  onGoogle: (credential: string) => void;
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

      <GoogleSignIn label="ili, da te liga pamti na svakom uređaju:" onCredential={onGoogle} />
    </form>
  );
}
