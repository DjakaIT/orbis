/**
 * Integracijska provjera API-ja lige protiv lokalnog workera.
 *
 *   pnpm exec wrangler dev --port 8787 --local
 *   node test-league.mjs
 */

const BASE = 'http://localhost:8787/api';

let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  → ${detail}`}`);
  if (!ok) failures++;
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zagreb',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

/* ------------------------------------------------------------- registracija */

const a = await call('/players', { method: 'POST', body: { nickname: 'Daniel' } });
check(
  'registracija vraća token',
  a.status === 201 && typeof a.json.token === 'string',
  JSON.stringify(a.json),
);
const tokenA = a.json.token;

const empty = await call('/players', { method: 'POST', body: { nickname: '  ' } });
check('prazan nadimak je 400', empty.status === 400);

const long = await call('/players', { method: 'POST', body: { nickname: 'x'.repeat(99) } });
check('predug nadimak je 400', long.status === 400);

const noAuth = await call('/me');
check('bez tokena je 401', noAuth.status === 401);

const badAuth = await call('/me', { token: 'nepostojeci' });
check('kriv token je 401', badAuth.status === 401);

const me = await call('/me', { token: tokenA });
check('/me vraća nadimak', me.json.nickname === 'Daniel', JSON.stringify(me.json));

/* -------------------------------------------------------------------- liga */

const created = await call('/leagues', { method: 'POST', body: { name: 'Ekipa' }, token: tokenA });
check(
  'liga kreirana',
  created.status === 201 && /^[A-HJ-NP-Z2-9]{6}$/.test(created.json.code ?? ''),
  JSON.stringify(created.json),
);
const code = created.json.code;
check('kod nema 0/O/1/I/L', !/[01OIL]/.test(code ?? ''), code);

const b = await call('/players', { method: 'POST', body: { nickname: 'Marta' } });
const tokenB = b.json.token;

const joined = await call(`/leagues/${code}/join`, { method: 'POST', token: tokenB });
check(
  'pridruživanje prolazi',
  joined.status === 200 && joined.json.name === 'Ekipa',
  JSON.stringify(joined.json),
);

const joinedAgain = await call(`/leagues/${code}/join`, { method: 'POST', token: tokenB });
check('ponovno pridruživanje tiho prolazi', joinedAgain.status === 200);

const lower = await call(`/leagues/${code.toLowerCase()}`, { token: tokenA });
check('kod radi i malim slovima', lower.status === 200);

const missing = await call('/leagues/ZZZZZZ', { token: tokenA });
check('nepostojeća liga je 404', missing.status === 404);

const c = await call('/players', { method: 'POST', body: { nickname: 'Uljez' } });
const outsider = await call(`/leagues/${code}`, { token: c.json.token });
check('nečlan ne vidi ljestvicu (403)', outsider.status === 403, JSON.stringify(outsider.json));

/* --------------------------------------------------------------- rezultati */

const bad = [
  [{ puzzle_date: today, mode: 'mjesec', guesses: 3, elapsed_ms: 5000 }, 'nepoznat mod'],
  [
    { puzzle_date: '14.9.2026.', mode: 'world', guesses: 3, elapsed_ms: 5000 },
    'neispravan format datuma',
  ],
  [{ puzzle_date: '2020-01-01', mode: 'world', guesses: 3, elapsed_ms: 5000 }, 'stari datum'],
  [{ puzzle_date: today, mode: 'world', guesses: 0, elapsed_ms: 5000 }, 'nula pokušaja'],
  [{ puzzle_date: today, mode: 'world', guesses: 3, elapsed_ms: 10 }, 'prekratko vrijeme'],
  [{ puzzle_date: today, mode: 'world', guesses: 3, elapsed_ms: 99_999_999 }, 'predugo vrijeme'],
];
for (const [body, label] of bad) {
  const res = await call('/scores', { method: 'POST', body, token: tokenA });
  check(`odbija ${label} (400)`, res.status === 400, `${res.status} ${JSON.stringify(res.json)}`);
}

const scoreA = await call('/scores', {
  method: 'POST',
  body: { puzzle_date: today, mode: 'world', guesses: 3, elapsed_ms: 42_000 },
  token: tokenA,
});
check(
  'rezultat prihvaćen',
  scoreA.status === 200 && scoreA.json.ok === true,
  JSON.stringify(scoreA.json),
);

const dup = await call('/scores', {
  method: 'POST',
  body: { puzzle_date: today, mode: 'world', guesses: 9, elapsed_ms: 99_000 },
  token: tokenA,
});
check('ponovni rezultat tiho pada', dup.status === 200);

/* -------------------------------------------------------------- ljestvica */

const beforeB = await call(`/leagues/${code}`, { token: tokenB });
const danielBefore = beforeB.json.standings?.find((r) => r.nickname === 'Daniel');
check(
  'Marta ne vidi Danielove današnje bodove dok sama nije odigrala',
  danielBefore?.points === 0,
  JSON.stringify(danielBefore),
);
check(
  'ali vidi kvačicu da je Daniel odigrao',
  danielBefore?.playedToday === true,
  JSON.stringify(danielBefore),
);
check('revealed je false', beforeB.json.revealed === false);

await call('/scores', {
  method: 'POST',
  body: { puzzle_date: today, mode: 'world', guesses: 5, elapsed_ms: 60_000 },
  token: tokenB,
});

const afterB = await call(`/leagues/${code}`, { token: tokenB });
check('nakon vlastite igre vidi sve', afterB.json.revealed === true);
const rows = afterB.json.standings ?? [];
check(
  'Daniel ima 6 bodova (3 pokušaja)',
  rows.find((r) => r.nickname === 'Daniel')?.points === 6,
  JSON.stringify(rows),
);
check(
  'Marta ima 4 boda (5 pokušaja)',
  rows.find((r) => r.nickname === 'Marta')?.points === 4,
  JSON.stringify(rows),
);
check(
  'Daniel je prvi',
  rows[0]?.nickname === 'Daniel' && rows[0]?.rank === 1,
  JSON.stringify(rows),
);
check('ljestvica ima oba igrača', rows.length === 2);

const roundId = afterB.json.round_id;
check('round_id je petak', new Date(`${roundId}T12:00:00Z`).getUTCDay() === 5, roundId);
check(
  'closes_at je 17:00 po Zagrebu',
  new Date(afterB.json.closes_at).toISOString().endsWith('15:00:00.000Z') ||
    new Date(afterB.json.closes_at).toISOString().endsWith('16:00:00.000Z'),
  new Date(afterB.json.closes_at).toISOString(),
);

console.log(`\n${failures === 0 ? 'SVE PROLAZI' : `PALO: ${failures}`}`);
console.log(`KOD=${code} TOKEN_A=${tokenA} TOKEN_B=${tokenB} ROUND=${roundId}`);
process.exit(failures === 0 ? 0 : 1);
