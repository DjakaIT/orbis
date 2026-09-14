import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clear, emptyState, load, recordSolved, save } from '../../src/state/persist';
import type { Persisted } from '../../src/types';

const TODAY = '2026-09-14';

beforeEach(() => {
  clear();
});

describe('load', () => {
  it('prazna pohrana daje prazno stanje', () => {
    expect(load(TODAY)).toEqual(emptyState());
  });

  it('smece u pohrani ne rusi igru', () => {
    localStorage.setItem('orbis:v1', 'ovo nije json');
    expect(load(TODAY)).toEqual(emptyState());
  });

  it('nepoznata verzija sheme daje prazno stanje umjesto krivog', () => {
    localStorage.setItem('orbis:v1', JSON.stringify({ v: 99, world: { date: TODAY } }));
    expect(load(TODAY)).toEqual(emptyState());
  });

  it('nedostupna pohrana ne rusi igru', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blokirani kolacici');
    });
    expect(load(TODAY)).toEqual(emptyState());
    spy.mockRestore();
  });

  it('cuva partiju istog dana', () => {
    const state: Persisted = {
      ...emptyState(),
      world: { date: TODAY, guesses: [1, 2], solved: false, startedAt: 5 },
    };
    save(state);
    expect(load(TODAY).world).toEqual(state.world);
  });
});

describe('prijelaz dana', () => {
  it('napustena partija broji se kao odigrana i lomi niz', () => {
    const stats = { played: 3, solved: 3, streak: 3, maxStreak: 3, dist: Array<number>(8).fill(0) };
    save({
      ...emptyState(),
      world: { date: '2026-09-13', guesses: [1], solved: false, startedAt: 5 },
      stats: { world: stats, hr: emptyState().stats.hr },
    });

    const next = load(TODAY);
    expect(next.world).toBeNull();
    expect(next.stats.world.played).toBe(4);
    expect(next.stats.world.streak).toBe(0);
  });

  it('rijeseno jucer zadrzava niz — lomi se tek nakon cijelog dana bez rjesenja', () => {
    const stats = { played: 3, solved: 3, streak: 3, maxStreak: 5, dist: Array<number>(8).fill(0) };
    save({
      ...emptyState(),
      world: { date: '2026-09-13', guesses: [1], solved: true, startedAt: 5 },
      stats: { world: stats, hr: emptyState().stats.hr },
    });

    const next = load(TODAY);
    expect(next.world).toBeNull();
    expect(next.stats.world.streak).toBe(3);
    expect(next.stats.world.played).toBe(3); // rijesena partija je vec prebrojana
  });

  it('propusten cijeli dan lomi niz', () => {
    const stats = { played: 3, solved: 3, streak: 3, maxStreak: 5, dist: Array<number>(8).fill(0) };
    save({
      ...emptyState(),
      world: { date: '2026-09-11', guesses: [1], solved: true, startedAt: 5 },
      stats: { world: stats, hr: emptyState().stats.hr },
    });

    expect(load(TODAY).stats.world.streak).toBe(0);
  });

  it('otvorena a neodigrana partija ne broji nista', () => {
    const stats = { played: 2, solved: 2, streak: 2, maxStreak: 2, dist: Array<number>(8).fill(0) };
    save({
      ...emptyState(),
      world: { date: '2026-09-13', guesses: [], solved: false, startedAt: 5 },
      stats: { world: stats, hr: emptyState().stats.hr },
    });

    const next = load(TODAY);
    expect(next.stats.world.played).toBe(2);
    expect(next.stats.world.streak).toBe(2);
  });

  it('modovi se lome neovisno', () => {
    save({
      ...emptyState(),
      world: { date: '2026-09-13', guesses: [1], solved: false, startedAt: 5 },
      hr: { date: TODAY, guesses: [2], solved: false, startedAt: 5, tier: 'gradovi' },
    });

    const next = load(TODAY);
    expect(next.world).toBeNull();
    expect(next.hr).not.toBeNull();
  });
});

describe('recordSolved', () => {
  it('podize niz i najduzi niz', () => {
    const stats = recordSolved(emptyState().stats.world, 3);
    expect(stats).toMatchObject({ played: 1, solved: 1, streak: 1, maxStreak: 1 });
    expect(stats.dist[2]).toBe(1);
  });

  it('najduzi niz pamti raniji rekord', () => {
    const base = { played: 9, solved: 9, streak: 1, maxStreak: 7, dist: Array<number>(8).fill(0) };
    expect(recordSolved(base, 1).maxStreak).toBe(7);
  });

  it('osam i vise pokusaja pada u zadnji pretinac', () => {
    expect(recordSolved(emptyState().stats.world, 40).dist[7]).toBe(1);
  });

  it('ne mijenja proslijedenu statistiku', () => {
    const base = emptyState().stats.world;
    recordSolved(base, 2);
    expect(base.played).toBe(0);
    expect(base.dist[1]).toBe(0);
  });
});

describe('save', () => {
  it('puna pohrana ne prekida partiju', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => {
      save(emptyState());
    }).not.toThrow();
    spy.mockRestore();
  });
});
