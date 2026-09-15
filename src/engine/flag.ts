/**
 * Putanja do zastave države, po ISO 3166-1 alpha-2 kodu.
 *
 * Emoji zastava (par regionalnih indikatora) bila bi besplatna, ali se na
 * Windowsu ne prikazuje — ondje nijedan sistemski rez nema glifove zastava, pa
 * Chrome ispiše gola dva slova. Zato idu prave slike iz `public/flags`, koje
 * `pnpm data` skida iz izvora.
 *
 * Zastava je jedina zasićena boja izvan gradijenta i `--hit`/`--error`, što
 * odstupa od SPEC §2.1. Odstupanje je svjesno i zapisano u DECISIONS.md: zastava
 * nosi podatak — koja je ovo država — i čita se brže od imena.
 */

/**
 * Vraća putanju ili `null` kad koda nema.
 *
 * `null`, ne nadomjesna slika: država bez valjanog alpha-2 koda u izvoru
 * (Kosovo, Sj. Cipar, Somaliland) nema zastavu, a izmišljen nadomjestak bio bi
 * netočan podatak. Sučelje tada jednostavno ne prikaže ništa.
 */
export function flagSrc(alpha2: string | undefined): string | null {
  const code = (alpha2 ?? '').trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? `/flags/${code}.svg` : null;
}
