import { useEffect, useId, useRef, useState } from 'react';

import { ApiError, createPlayer } from '../league/client';
import { patch } from '../state/persist';
import type { Player } from '../types';
import styles from './Welcome.module.css';

/**
 * Prvo što igrač vidi: jedno pitanje i jedno polje.
 *
 * Ime se traži odmah, na ulazu, a ne tek kad netko otvori ligu — tako je igrač
 * spreman za ligu prije nego što uopće sazna da postoji, i kasnije mu se isto
 * pitanje ne postavlja usred partije.
 *
 * Preskakanje postoji namjerno. Upis ide preko mreže i može pasti; bez izlaza bi
 * pala mreža značila da se igra uopće ne može igrati, a igra ligu ne treba.
 */
export default function Welcome({ onDone }: { onDone: () => void }) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    field.current?.focus();
  }, []);

  async function submit(): Promise<void> {
    const name = nickname.trim();
    if (!name) return;

    setBusy(true);
    setError(null);
    try {
      const created = await createPlayer(name);
      const player: Player = { id: created.player_id, token: created.token, nickname: name };
      patch({ player });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Upis nije uspio');
      setBusy(false);
    }
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <div className={styles.card} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <p className={styles.wordmark}>Orbis</p>
        <h1 id={titleId} className={styles.lead}>
          Kako da te zovemo?
        </h1>
        <p className={styles.note}>
          Ime stoji na ljestvici lige. Bez emaila, bez lozinke — samo nadimak.
        </p>

        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            ref={field}
            className={styles.input}
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
            }}
            placeholder="Nadimak"
            aria-label="Nadimak"
            maxLength={24}
            autoComplete="nickname"
            autoCapitalize="words"
          />
          <button type="submit" className={styles.button} disabled={busy || !nickname.trim()}>
            {busy ? 'Čekaj' : 'Kreni'}
          </button>
        </form>

        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button type="button" className={styles.skip} onClick={onDone}>
          Preskoči, igrat ću bez lige
        </button>
      </div>
    </div>
  );
}
