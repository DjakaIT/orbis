import { useState } from 'react';

import styles from './League.module.css';

/**
 * Kod lige, veliko i za poslati dalje.
 *
 * Prije je stajao u podnožju ljestvice, sitno, u rečenici — a on je jedino što
 * osnivač mora nekome proslijediti da liga uopće postoji. Zato je sada prvo što
 * se vidi nakon otvaranja, uz gumb koji ga kopira.
 */
export default function Invite({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      globalThis.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      /*
       * Kopiranje traži dozvolu i sigurni kontekst; kad ga nema, kod je i dalje
       * na ekranu i može se prepisati. Nije greška vrijedna poruke.
       */
    }
  }

  return (
    <section className={styles.invite} aria-label="Kod lige">
      <p className={styles.inviteLead}>Pošalji ovaj kod ekipi</p>
      <div className={styles.inviteRow}>
        <strong className={styles.bigCode}>{code}</strong>
        <button type="button" className={styles.button} onClick={() => void copy()}>
          {copied ? 'Kopirano' : 'Kopiraj'}
        </button>
      </div>
      <p className={styles.note}>Oni otvore Ligu, stisnu „Imam kod" i upišu ga.</p>
    </section>
  );
}
