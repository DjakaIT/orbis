import { useEffect, useRef, useState } from 'react';

import { configured, mountGoogleButton } from '../../league/google';
import styles from './League.module.css';

/**
 * Googleov gumb za prijavu, ako je prijava podešena.
 *
 * Bez `VITE_GOOGLE_CLIENT_ID` ili kad se knjižnica ne uspije povući, komponenta
 * ne nacrta ništa — ni prazan okvir ni poruku o grešci. Prijava je ovdje dodatak
 * koji čini da liga pamti igrača preko uređaja; nadimak i dalje radi sam, pa
 * njezin izostanak nije kvar o kojem treba obavještavati.
 */
export default function GoogleSignIn({
  label,
  onCredential,
}: {
  label: string;
  onCredential: (credential: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  /*
   * Callback se drži u refu: `mountGoogleButton` se smije pozvati samo jednom
   * jer crta Googleov iframe, a novi render s novom funkcijom ne smije ga
   * ponovno postavljati.
   */
  const handler = useRef(onCredential);

  useEffect(() => {
    handler.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!configured) return;
    const el = host.current;
    if (!el) return;

    let alive = true;
    void mountGoogleButton(el, (credential) => {
      handler.current(credential);
    }).then((ok) => {
      if (alive) setShown(ok);
    });

    return () => {
      alive = false;
    };
  }, []);

  if (!configured) return null;

  return (
    <div className={styles.google} hidden={!shown}>
      <p className={styles.googleLead}>{label}</p>
      <div ref={host} />
    </div>
  );
}
