import type { Mode } from '../types';
import styles from './ModeToggle.module.css';

const MODES: { id: Mode; label: string }[] = [
  { id: 'world', label: 'Svijet' },
  { id: 'hr', label: 'Hrvatska' },
];

/** Wordmark lijevo, mod desno. SPEC §2.4. */
export default function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <div className={styles.wrap} role="tablist" aria-label="Mod igre">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          className={`${styles.tab} ${mode === m.id ? styles.on : ''}`.trim()}
          onClick={() => {
            onChange(m.id);
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
