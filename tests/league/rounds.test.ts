import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addMember,
  createLeague,
  createPlayer,
  putScore,
  roundState,
} from '../../netlify/lib/data';
import {
  allStandings,
  closeDueRounds,
  closeIfEveryoneDone,
  closeRound,
  currentRound,
  everyoneDone,
  standings,
} from '../../netlify/lib/rounds';
import { memoryStore, type Store } from '../../netlify/lib/store';

/**
 * Runda kroz tjedne: ljestvica, zatvaranje, i prate li se isti igrači dalje.
 *
 * Ovo se prije moglo provjeriti samo protiv pokrenutog Workera i prave baze, pa
 * je i postojalo samo kao ručna skripta. Sada je običan test: spremište je mapa,
 * a sat se pina, pa se cijeli tjedan odvrti u milisekundama.
 */

const LEAGUE = 'liga-1';
const FRIDAY = '2026-09-18';
const NEXT_FRIDAY = '2026-09-25';

let store: Store;

/** Utorak u tjednu koji završava s FRIDAY. */
function pin(iso: string): void {
  vi.setSystemTime(new Date(iso));
}

async function member(id: string, nickname: string): Promise<void> {
  await createPlayer(store, id, `hash-${id}`, nickname);
  await addMember(store, LEAGUE, id);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  pin('2026-09-15T10:00:00Z');

  store = memoryStore();
  await createLeague(store, { id: LEAGUE, code: 'ABCDEF', name: 'Ekipa', ownerId: 'ana' });
  await member('ana', 'Ana');
  await member('bruno', 'Bruno');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ljestvica', () => {
  it('manje pokušaja nosi više bodova', async () => {
    await putScore(store, 'ana', FRIDAY, '2026-09-15', 'world', { guesses: 2, elapsedMs: 20_000 });
    await putScore(store, 'bruno', FRIDAY, '2026-09-15', 'world', {
      guesses: 6,
      elapsedMs: 20_000,
    });

    const table = await standings(store, LEAGUE, FRIDAY, true, 'world', '2026-09-16');
    expect(table.map((r) => r.nickname)).toEqual(['Ana', 'Bruno']);
    expect(table[0]?.rank).toBe(1);
    expect(table[0]?.points).toBeGreaterThan(table[1]?.points ?? 0);
  });

  it('današnji rezultati se ne broje dok igrač sam ne odigra', async () => {
    await putScore(store, 'bruno', FRIDAY, '2026-09-15', 'world', {
      guesses: 2,
      elapsedMs: 20_000,
    });

    const hidden = await standings(store, LEAGUE, FRIDAY, false, 'world', '2026-09-15');
    const bruno = hidden.find((r) => r.nickname === 'Bruno');
    expect(bruno?.points).toBe(0);
    // Kvačica se ipak vidi — ona je jedino što ekipu tjera da zaigra. SPEC §7.6.
    expect(bruno?.playedToday).toBe(true);
  });

  it('član bez ijednog rezultata je na ljestvici s nulom', async () => {
    const table = await standings(store, LEAGUE, FRIDAY, true, 'world', '2026-09-16');
    expect(table).toHaveLength(2);
    expect(table.every((r) => r.points === 0)).toBe(true);
  });
});

describe('zatvaranje runde', () => {
  async function everyonePlaysFriday(): Promise<void> {
    for (const id of ['ana', 'bruno']) {
      await putScore(store, id, FRIDAY, FRIDAY, 'world', { guesses: 3, elapsedMs: 30_000 });
    }
  }

  it('ne zatvara se dok svi ne odigraju posljednji dan', async () => {
    await putScore(store, 'ana', FRIDAY, FRIDAY, 'world', { guesses: 3, elapsedMs: 30_000 });

    expect(await everyoneDone(store, LEAGUE, FRIDAY)).toBe(false);
    expect(await closeIfEveryoneDone(store, LEAGUE, FRIDAY)).toBe(false);
  });

  it('zatvara se čim svi odigraju, i prije 17:00', async () => {
    await everyonePlaysFriday();

    expect(await closeIfEveryoneDone(store, LEAGUE, FRIDAY)).toBe(true);
    const state = await roundState(store, LEAGUE, FRIDAY);
    expect(state?.closedAt).toBeTruthy();
  });

  it('snapshot nosi nadimke, da povijest ostane čitljiva', async () => {
    await everyonePlaysFriday();
    await closeRound(store, LEAGUE, FRIDAY);

    const results = ((await roundState(store, LEAGUE, FRIDAY))?.results?.world ?? []) as {
      nickname: string;
    }[];
    expect(results.map((r) => r.nickname).sort()).toEqual(['Ana', 'Bruno']);
  });

  it('zatvorena runda se ne zatvara dvaput', async () => {
    await everyonePlaysFriday();
    expect(await closeRound(store, LEAGUE, FRIDAY)).toBe(true);
    expect(await closeRound(store, LEAGUE, FRIDAY)).toBe(false);
  });

  it('sljedeća runda se otvara odmah — nema praznog tjedna', async () => {
    await everyonePlaysFriday();
    await closeRound(store, LEAGUE, FRIDAY);

    const next = await roundState(store, LEAGUE, NEXT_FRIDAY);
    expect(next).not.toBeNull();
    expect(next?.closedAt).toBeNull();
  });
});

describe('iz tjedna u tjedan', () => {
  it('ista ekipa igra i sljedeći tjedan, s praznom ljestvicom', async () => {
    /*
     * Ovo je ono što liga zapravo jest: niz tjedana, ne jedan. Članstvo mora
     * preživjeti zatvaranje runde, a bodovi ne smiju.
     */
    for (const id of ['ana', 'bruno']) {
      await putScore(store, id, FRIDAY, FRIDAY, 'world', { guesses: 2, elapsedMs: 20_000 });
    }
    await closeRound(store, LEAGUE, FRIDAY);

    const week2 = await standings(store, LEAGUE, NEXT_FRIDAY, true, 'world', '2026-09-22');
    expect(week2.map((r) => r.nickname).sort()).toEqual(['Ana', 'Bruno']);
    expect(week2.every((r) => r.points === 0)).toBe(true);

    // A prošli tjedan je i dalje ondje, sa svojim bodovima.
    const week1 = ((await roundState(store, LEAGUE, FRIDAY))?.results?.world ?? []) as {
      points: number;
    }[];
    expect(week1.some((r) => r.points > 0)).toBe(true);
  });

  it('novi član ulazi u tekuću rundu, ne u zatvorenu', async () => {
    for (const id of ['ana', 'bruno']) {
      await putScore(store, id, FRIDAY, FRIDAY, 'world', { guesses: 2, elapsedMs: 20_000 });
    }
    await closeRound(store, LEAGUE, FRIDAY);

    await member('cvita', 'Cvita');

    const closed = ((await roundState(store, LEAGUE, FRIDAY))?.results?.world ?? []) as {
      nickname: string;
    }[];
    expect(closed.map((r) => r.nickname)).not.toContain('Cvita');

    const open = await standings(store, LEAGUE, NEXT_FRIDAY, true, 'world', '2026-09-22');
    expect(open.map((r) => r.nickname)).toContain('Cvita');
  });

  it('runda se računa iz dana, pa isti tjedan daje isti round_id', async () => {
    pin('2026-09-15T10:00:00Z');
    const tuesday = await currentRound(store, LEAGUE);
    pin('2026-09-17T23:00:00Z');
    const thursday = await currentRound(store, LEAGUE);

    expect(tuesday).toBe(FRIDAY);
    expect(thursday).toBe(FRIDAY);
  });
});

describe('zakazano zatvaranje', () => {
  it('prije 17:00 ne zatvara ništa', async () => {
    pin('2026-09-18T12:00:00Z'); // petak, 14:00 u Zagrebu
    expect(await closeDueRounds(store)).toBe(0);
  });

  it('nakon 17:00 zatvara dospjelu rundu i kad nisu svi odigrali', async () => {
    // Ovo pokriva tjedne u kojima netko nije igrao — inače bi runda visjela.
    await currentRound(store, LEAGUE);
    pin('2026-09-18T16:00:00Z'); // petak, 18:00 u Zagrebu

    expect(await closeDueRounds(store)).toBe(1);
    expect((await roundState(store, LEAGUE, FRIDAY))?.closedAt).toBeTruthy();
  });

  it('buduće runde ostaju otvorene', async () => {
    await currentRound(store, LEAGUE);
    pin('2026-09-18T16:00:00Z');
    await closeDueRounds(store);

    // Sljedeći petak još nije došao.
    expect((await roundState(store, LEAGUE, NEXT_FRIDAY))?.closedAt).toBeNull();
  });
});

describe('modovi se boduju odvojeno', () => {
  it('bodovi iz jednog moda ne ulaze u ljestvicu drugog', async () => {
    /*
     * Prije su se zbrajali svi modovi, pa je pogodak iz glavnih gradova dizao
     * isti redak kao i pogodak iz država — iz ljestvice se nije vidjelo tko je
     * u čemu bolji. Sada je svaki mod vlastiti stupac.
     */
    await putScore(store, 'ana', FRIDAY, '2026-09-15', 'world', { guesses: 1, elapsedMs: 10_000 });
    await putScore(store, 'bruno', FRIDAY, '2026-09-15', 'capitals', {
      guesses: 1,
      elapsedMs: 10_000,
    });

    const world = await standings(store, LEAGUE, FRIDAY, true, 'world', '2026-09-16');
    const capitals = await standings(store, LEAGUE, FRIDAY, true, 'capitals', '2026-09-16');

    expect(world.find((r) => r.nickname === 'Ana')?.points).toBe(10);
    expect(world.find((r) => r.nickname === 'Bruno')?.points).toBe(0);

    expect(capitals.find((r) => r.nickname === 'Bruno')?.points).toBe(10);
    expect(capitals.find((r) => r.nickname === 'Ana')?.points).toBe(0);
  });

  it('kvačica prati mod, ne bilo koju odigranu partiju', async () => {
    await putScore(store, 'ana', FRIDAY, '2026-09-15', 'world', { guesses: 3, elapsedMs: 30_000 });

    const world = await standings(store, LEAGUE, FRIDAY, true, 'world', '2026-09-15');
    const hr = await standings(store, LEAGUE, FRIDAY, true, 'hr', '2026-09-15');

    expect(world.find((r) => r.nickname === 'Ana')?.playedToday).toBe(true);
    expect(hr.find((r) => r.nickname === 'Ana')?.playedToday).toBe(false);
  });

  it('allStandings vraća sva tri moda, i prazne', async () => {
    await putScore(store, 'ana', FRIDAY, '2026-09-15', 'hr', { guesses: 4, elapsedMs: 40_000 });

    const all = await allStandings(store, LEAGUE, FRIDAY, true, '2026-09-16');
    expect(Object.keys(all).sort()).toEqual(['capitals', 'hr', 'world']);
    expect(all.hr.find((r) => r.nickname === 'Ana')?.points).toBe(5);
    expect(all.world.every((r) => r.points === 0)).toBe(true);
    expect(all.capitals.every((r) => r.points === 0)).toBe(true);
  });

  it('snapshot zatvorene runde nosi sva tri moda', async () => {
    for (const id of ['ana', 'bruno']) {
      await putScore(store, id, FRIDAY, FRIDAY, 'world', { guesses: 2, elapsedMs: 20_000 });
    }
    await closeRound(store, LEAGUE, FRIDAY);

    const results = (await roundState(store, LEAGUE, FRIDAY))?.results;
    expect(Object.keys(results ?? {}).sort()).toEqual(['capitals', 'hr', 'world']);
  });
});
