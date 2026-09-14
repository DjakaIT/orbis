/** Share tekst za grupni chat. SPEC §7.6. */

import { distanceSquare } from './color';
import type { Mode } from './seed';

const SITE = 'orbis.hr';

/** „4 pokušaja", ali „1 pokušaj". */
export function guessNoun(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? 'pokušaj' : 'pokušaja';
}

/**
 * ```
 * Orbis 🌍 15.9. — 4 pokušaja
 * 🟦🟪🟧🟩
 * orbis.hr
 * ```
 *
 * Kvadratići idu **kronološki**, ne po sortiranju liste — inače se ne vidi kako
 * se igrač približavao meti.
 */
export function shareText(
  date: string,
  guesses: { km: number }[],
  mode: Mode,
  site = SITE,
): string {
  const [, month, day] = date.split('-');
  const short = `${String(Number(day))}.${String(Number(month))}.`;
  const squares = guesses.map((g) => distanceSquare(g.km, mode)).join('');
  const globe = mode === 'world' ? '🌍' : '🇭🇷';
  return `Orbis ${globe} ${short} — ${String(guesses.length)} ${guessNoun(guesses.length)}\n${squares}\n${site}`;
}
