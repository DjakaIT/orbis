/**
 * Prati li liga iste igrače iz tjedna u tjedan. SPEC §7.3.
 *
 * Liga nije jedan tjedan nego niz tjedana. Ovo vozi dvije uzastopne runde protiv
 * prave baze i provjerava da nadimci prežive zatvaranje runde: da članstvo ostane,
 * da snapshot zatvorene runde zadrži imena, i da nova runda krene s istom ekipom.
 *
 * Runda se zatvara tako da se petkovi redci upišu izravno u lokalni D1 — isti
 * postupak kao u `test-close.mjs`, jer se inače na pravi petak mora čekati.
 *
 *   node test-weeks.mjs
 *
 * Traži pokrenut `pnpm worker:dev` na :8787.
 */

import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:8787/api';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  → ${detail}`}`);
  if (!ok) failures++;
}

/** wrangler --json serijalizira SQL NULL kao string "null", ne kao JSON null. */
const isNull = (v) => v === null || v === 'null';

/**
 * Preko datoteke, ne `--command`: upiti imaju razmake i shell ih inače reže.
 *
 * `npx`, ne `pnpm exec`: skripta ne smije ovisiti o tome koji je upravitelj
 * paketa na stroju, a na nekima je pnpm blokiran politikom.
 */
function sql(query) {
  const file = join(
    tmpdir(),
    `orbis-weeks-${String(Date.now())}-${String(Math.trunc(Math.random() * 1e6))}.sql`,
  );
  writeFileSync(file, query, 'utf8');
  try {
    const out = execFileSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'orbis-db', '--local', '--json', '--file', file],
      { encoding: 'utf8', shell: true, cwd: import.meta.dirname },
    );
    return JSON.parse(out.slice(out.indexOf('[')));
  } finally {
    rmSync(file, { force: true });
  }
}

/**
 * Poziv API-ja, uz ograničen ponovni pokušaj.
 *
 * `wrangler dev` primijeti kad se lokalni D1 promijeni ispod njega i zna prekinuti
 * otvorenu vezu. To je svojstvo lokalnog razvoja, ne API-ja, pa se prekid veze
 * ponavlja — a svaki odgovor koji je stigao vraća se kakav jest.
 */
async function call(path, { method = 'GET', token, body } = {}) {
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(BASE + path, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      break;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

/** Zagrebački dan, jer API prima samo današnji ili jučerašnji datum. SPEC §7.5. */
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zagreb',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Petak kojim runda završava, `n` tjedana od zadanog. */
function roundPlus(roundId, weeks) {
  const base = new Date(`${roundId}T00:00:00Z`);
  return new Date(base.getTime() + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
}

const suffix = Date.now().toString(36).slice(-5);
const NICK_A = `Ana-${suffix}`;
const NICK_B = `Bruno-${suffix}`;

/* ------------------------------------------------------------------ prijava */

const a = await call('/players', { method: 'POST', body: { nickname: NICK_A } });
const b = await call('/players', { method: 'POST', body: { nickname: NICK_B } });
check('dva igrača su se prijavila nadimkom', a.status === 201 && b.status === 201, a.text);
check('server je vratio upisani nadimak', a.json?.nickname === NICK_A, a.text);

const tokenA = a.json?.token;
const tokenB = b.json?.token;

const created = await call('/leagues', {
  method: 'POST',
  token: tokenA,
  body: { name: `Tjedni-${suffix}` },
});
check('liga je otvorena', created.status === 201, created.text);
const code = created.json?.code;

const joined = await call(`/leagues/${code}/join`, { method: 'POST', token: tokenB });
check('drugi igrač se pridružio', joined.status === 200 || joined.status === 201, joined.text);

/* ------------------------------------------------------------- prvi tjedan */

const view = await call(`/leagues/${code}`, { token: tokenA });
const round1 = view.json?.round_id;
check('liga ima otvorenu rundu', Boolean(round1), view.text);

const players = sql(
  `SELECT id, nickname FROM players WHERE nickname IN ('${NICK_A}', '${NICK_B}')`,
)[0].results;
check('oba igrača su u bazi', players.length === 2, JSON.stringify(players));

/*
 * Runda se zatvara kad svi predaju rezultat za njezin posljednji dan — sam petak.
 * Taj je datum u budućnosti, a API prima samo današnji ili jučerašnji, pa se
 * petkovi redci upisuju izravno u bazu; isti postupak kao u `test-close.mjs`.
 */
for (const p of players) {
  sql(
    `INSERT OR IGNORE INTO scores (player_id, puzzle_date, mode, guesses, elapsed_ms, round_id)
     VALUES ('${p.id}', '${round1}', 'world', 3, 45000, '${round1}')`,
  );
}

// Provjera se okida nakon svake predaje; ova ide s valjanim, današnjim datumom.
const trigger = await call('/scores', {
  method: 'POST',
  token: tokenA,
  body: { puzzle_date: today(), mode: 'hr', guesses: 2, elapsed_ms: 30000 },
});
check('predaja rezultata je prošla', trigger.status === 200, trigger.text);
check('predaja je zatvorila rundu', trigger.json?.round_closed === true, trigger.text);

/*
 * Upiti se ograničavaju na OVU ligu. Baza nosi runde svih liga pod istim
 * `round_id`, pa bi nescoped upit mjerio tuđe runde — prva verzija ovog testa
 * je tako i pala, s imenima iz ranijih pokretanja.
 */
const closed1 = sql(
  `SELECT r.closed_at, r.results FROM rounds r
     JOIN leagues l ON l.id = r.league_id
    WHERE l.code = '${code}' AND r.round_id = '${round1}'`,
)[0].results;
check(
  'prva runda je zatvorena',
  closed1.length > 0 && closed1.every((r) => !isNull(r.closed_at)),
  JSON.stringify(closed1.map((r) => r.closed_at)),
);

const snapshot = JSON.parse(closed1[0]?.results ?? 'null') ?? [];
const snapshotNames = snapshot.map((r) => r.nickname).sort();
check(
  'snapshot zatvorene runde nosi oba nadimka',
  snapshotNames.join(',') === [NICK_A, NICK_B].sort().join(','),
  JSON.stringify(snapshotNames),
);

/* ------------------------------------------------------------ drugi tjedan */

const round2 = roundPlus(round1, 1);
const opened = sql(
  `SELECT r.round_id, r.closed_at FROM rounds r
     JOIN leagues l ON l.id = r.league_id
    WHERE l.code = '${code}' AND r.round_id = '${round2}'`,
)[0].results;
check(
  'sljedeća runda je otvorena odmah, bez praznog tjedna',
  opened.length > 0 && isNull(opened[0]?.closed_at),
  JSON.stringify(opened),
);

// Rezultat u drugom tjednu, istim igračem i istim tokenom.
for (const p of players) {
  sql(
    `INSERT OR IGNORE INTO scores (player_id, puzzle_date, mode, guesses, elapsed_ms, round_id)
     VALUES ('${p.id}', '${round2}', 'world', 4, 60000, '${round2}')`,
  );
}

const week2 = sql(
  `SELECT p.nickname, COUNT(s.player_id) AS n
     FROM members m
     JOIN players p ON p.id = m.player_id
     LEFT JOIN scores s ON s.player_id = p.id AND s.round_id = '${round2}'
     JOIN leagues l ON l.id = m.league_id
    WHERE l.code = '${code}'
    GROUP BY p.nickname
    ORDER BY p.nickname`,
)[0].results;

check(
  'ista dva nadimka su u ligi i drugi tjedan',
  week2.length === 2 && week2.every((r) => r.nickname.endsWith(suffix)),
  JSON.stringify(week2),
);
check(
  'oba imaju rezultat u drugoj rundi',
  week2.every((r) => Number(r.n) > 0),
  JSON.stringify(week2),
);

/* --------------------------------------------------------------- povijest */

const history = await call(`/leagues/${code}/rounds`, { token: tokenA });
check('povijest zatvorenih rundi je dostupna', history.status === 200, history.text);
check(
  'prva runda je u povijesti, s imenima',
  history.json?.rounds?.some(
    (r) => r.round_id === round1 && JSON.stringify(r.results ?? r).includes(NICK_A),
  ),
  JSON.stringify(history.json?.rounds?.map((r) => r.round_id)),
);

/* ------------------------------------------- isti nadimak, novi uređaj */

const again = await call('/players', { method: 'POST', body: { nickname: NICK_A } });
check(
  'isti nadimak s novog uređaja dobiva NOVI identitet',
  again.status === 201 && again.json?.player_id !== a.json?.player_id,
  `${String(again.json?.player_id)} vs ${String(a.json?.player_id)}`,
);
console.log(
  '      ↳ zato postoji link za povrat /v/:token — nadimak nije lozinka i ne vraća članstvo',
);

const me = await call('/me', { token: tokenA });
check(
  'stari token i dalje vodi na istog igrača i njegovu ligu',
  me.status === 200 && me.json?.nickname === NICK_A && me.json?.leagues?.length > 0,
  me.text,
);

console.log(failures === 0 ? '\nsve prošlo' : `\n${String(failures)} pao/palo`);
process.exit(failures === 0 ? 0 : 1);
