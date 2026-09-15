import { useId, useMemo, useRef, useState } from 'react';

import { suggest, type SearchEntry } from '../engine/search';
import { useGame } from '../state/context';
import type { Mode } from '../types';
import styles from './GuessInput.module.css';

/**
 * Polje za unos s autocompleteom. SPEC §5.4.
 *
 * Uvijek vidljivo bez scrolla; dropdown ide prema gore kad je polje u donjoj
 * polovici ekrana, inace ga tipkovnica prekrije na mobitelu.
 */
/** Sto se upisuje u kojem modu. Ujedno i `aria-label` polja. */
const LABEL: Record<Mode, string> = {
  world: 'Upiši državu',
  capitals: 'Upiši glavni grad',
  hr: 'Upiši naselje',
};

export default function GuessInput() {
  const { state, guess, index } = useGame();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [up, setUp] = useState(false);

  const field = useRef<HTMLInputElement>(null);
  const listId = useId();
  const disabled = state.solved || state.status !== 'ready';
  // Svaki mod ima svoju metu, pa i svoju uputu.
  const label = LABEL[state.mode];

  // Prijedlozi su izvedeni iz unosa — računaju se u renderu, ne u efektu.
  const options = useMemo<SearchEntry[]>(
    () => (index && value.trim() && open ? suggest(value, index) : []),
    [value, index, open],
  );

  function submit(name: string): void {
    if (!name.trim()) return;
    if (guess(name)) setValue('');
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(options[active]?.name ?? value);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  /** Dropdown gore ili dolje, ovisno o tome gdje je polje na ekranu. */
  function onFocus(): void {
    const box = field.current?.getBoundingClientRect();
    if (box) setUp(box.top > globalThis.innerHeight / 2);
    setOpen(true);
  }

  return (
    <div className={styles.wrap}>
      <input
        ref={field}
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        disabled={disabled}
        placeholder={state.solved ? 'Pogodak' : label}
        aria-label={label}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${String(active)}` : undefined}
      />

      {options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className={`${styles.options} ${up ? styles.up : ''}`.trim()}
        >
          {options.map((o, i) => (
            <li key={o.id} id={`${listId}-${String(i)}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`${styles.option} ${i === active ? styles.active : ''}`.trim()}
                // onMouseDown umjesto onClick: blur bi zatvorio listu prije klika.
                onMouseDown={(e) => {
                  e.preventDefault();
                  submit(o.name);
                }}
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.unknown !== null && (
        <p className={styles.unknown} role="status">
          Ne prepoznajem „{state.unknown}”.
        </p>
      )}
    </div>
  );
}
