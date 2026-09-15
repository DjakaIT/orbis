import type { Tier } from '../types';
import styles from './TierToggle.module.css';

const TIERS: { id: Tier; label: string }[] = [
  { id: 'gradovi', label: 'Gradovi' },
  { id: 'mjesta', label: 'Mjesta' },
];

/**
 * Razina težine u modu Hrvatska. SPEC §4.4.
 *
 * Svaka razina je vlastiti bazen meta, pa promjena razine počinje novu partiju —
 * indeks iz jednog bazena u drugom označava drugo naselje.
 */
export default function TierToggle({
  tier,
  onChange,
}: {
  tier: Tier;
  onChange: (tier: Tier) => void;
}) {
  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Razina</span>
      {/* Ista stvar izgleda isto: staza pa segmenti, kao i traka modova. */}
      <div className={styles.track}>
        {TIERS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tier === t.id}
            className={`${styles.tier} ${tier === t.id ? styles.on : ''}`.trim()}
            onClick={() => {
              onChange(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
