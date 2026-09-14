/**
 * Rano zatvaranje runde. SPEC §7.3.
 *
 * Runda se zatvara čim svi članovi predaju rezultat za posljednji dan runde —
 * sam petak — i prije 17:00. Ovdje se taj uvjet namjesti upisom petkovih redaka
 * izravno u lokalni D1, pa se okine običnom predajom rezultata.
 *
 *   node test-close.mjs <KOD> <TOKEN_A> <TOKEN_B> <ROUND_ID>
 */

import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:8787/api';
const [code, tokenA, tokenB, roundId] = process.argv.slice(2);

if (!code || !tokenA || !tokenB || !roundId) {
  console.error('Upotreba: node test-close.mjs <KOD> <TOKEN_A> <TOKEN_B> <ROUND_ID>');
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  → ${detail}`}`);
  if (!ok) failures++;
}

/** wrangler --json serijalizira SQL NULL kao string "null", ne kao JSON null. */
const isNull = (v) => v === null || v === 'null';

/** Preko datoteke, ne `--command`: upiti imaju razmake i shell ih inače reže. */
function sql(query) {
  const file = join(
    tmpdir(),
    `orbis-${String(Date.now())}-${String(Math.trunc(Math.random() * 1e6))}.sql`,
  );
  writeFileSync(file, query, 'utf8');
  try {
    const out = execFileSync(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'execute', 'orbis-db', '--local', '--json', '--file', file],
      { encoding: 'utf8', shell: true },
    );
    const start = out.indexOf('[');
    return start === -1 ? [] : JSON.parse(out.slice(start));
  } finally {
    rmSync(file, { force: true });
  }
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
  return { status: res.status, json: await res.json() };
}

const players = sql(
  `SELECT p.id, p.nickname FROM players p
   JOIN members m ON m.player_id = p.id
   JOIN leagues l ON l.id = m.league_id
   WHERE l.code = '${code}'`,
)[0].results;

check('liga ima dva člana', players.length === 2, JSON.stringify(players));

// Svi predali rezultat za posljednji dan runde (sam petak).
for (const p of players) {
  sql(
    `INSERT OR IGNORE INTO scores (player_id, puzzle_date, mode, guesses, elapsed_ms, round_id)
     VALUES ('${p.id}', '${roundId}', 'world', 2, 30000, '${roundId}')`,
  );
}

const before = sql(`SELECT closed_at FROM rounds WHERE round_id = '${roundId}'`)[0].results;
check(
  'runda je još otvorena',
  before.every((r) => isNull(r.closed_at)),
  JSON.stringify(before),
);

// Obična predaja rezultata okida provjeru „je li to bio zadnji nedostajući?".
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zagreb',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const trigger = await call('/scores', {
  method: 'POST',
  body: { puzzle_date: today, mode: 'hr', guesses: 4, elapsed_ms: 51_000 },
  token: tokenA,
});
check('predaja prolazi', trigger.status === 200, JSON.stringify(trigger.json));
check(
  'odgovor javlja da je runda zatvorena',
  trigger.json.round_closed === true,
  JSON.stringify(trigger.json),
);

const after = sql(`SELECT closed_at, results FROM rounds WHERE round_id = '${roundId}'`)[0].results;
check(
  'closed_at je postavljen',
  after.every((r) => !isNull(r.closed_at)),
  JSON.stringify(after.map((r) => r.closed_at)),
);

const snapshot = JSON.parse(after[0].results ?? '[]');
check('snimljena je konačna ljestvica', snapshot.length === 2, JSON.stringify(snapshot));
check(
  'snapshot ima bodove i poredak',
  snapshot[0]?.rank === 1 && typeof snapshot[0]?.points === 'number',
  JSON.stringify(snapshot[0]),
);

// Zatvorena runda je nepromjenjiva.
const late = await call('/scores', {
  method: 'POST',
  body: { puzzle_date: today, mode: 'world', guesses: 2, elapsed_ms: 20_000 },
  token: tokenB,
});
check(
  'naknadni rezultat je 409',
  late.status === 409,
  `${late.status} ${JSON.stringify(late.json)}`,
);

// Sljedeća runda je otvorena da ljestvica ne ostane bez nje.
const nextId = new Date(new Date(`${roundId}T00:00:00Z`).getTime() + 7 * 86400000)
  .toISOString()
  .slice(0, 10);
const next = sql(`SELECT round_id, closed_at FROM rounds WHERE round_id = '${nextId}'`)[0].results;
check(
  'sljedeća runda je otvorena',
  next.length > 0 && isNull(next[0].closed_at),
  JSON.stringify(next),
);

const view = await call(`/leagues/${code}/rounds`, { token: tokenA });
check(
  'zatvorena runda je u povijesti',
  view.json.rounds?.some((r) => r.round_id === roundId),
  JSON.stringify(view.json.rounds?.map((r) => r.round_id)),
);

console.log(`\n${failures === 0 ? 'SVE PROLAZI' : `PALO: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
