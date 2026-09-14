import { describe, expect, it } from 'vitest';

import { dailyTarget } from '../../src/engine/seed';
import { addDays, lastNDates } from '../../src/engine/time';

const POOL = 177;

describe('dailyTarget', () => {
  it('isti datum i mod daju isti indeks — bez toga liga nema smisla', () => {
    expect(dailyTarget('2026-09-14', 'world', POOL)).toBe(dailyTarget('2026-09-14', 'world', POOL));
  });

  it('razliciti modovi istog dana daju neovisne mete', () => {
    expect(dailyTarget('2026-09-14', 'world', POOL)).not.toBe(
      dailyTarget('2026-09-14', 'hr', POOL),
    );
  });

  it('uvijek je unutar bazena', () => {
    let date = '2026-01-01';
    for (let i = 0; i < 400; i++) {
      const idx = dailyTarget(date, 'world', POOL);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(POOL);
      date = addDays(date, 1);
    }
  });

  it('ne ponavlja metu unutar 30 dana', () => {
    const seen = new Map<number, string>();
    let date = '2026-03-01';
    for (let i = 0; i < 400; i++) {
      const idx = dailyTarget(date, 'world', POOL);
      const previous = seen.get(idx);
      if (previous !== undefined) {
        expect(lastNDates(date, 30).includes(previous), `${date} ponavlja metu s ${previous}`).toBe(
          false,
        );
      }
      seen.set(idx, date);
      date = addDays(date, 1);
    }
  });

  it('vrijedi i za mod hr, s manjim bazenom', () => {
    const seen = new Map<number, string>();
    let date = '2026-03-01';
    for (let i = 0; i < 200; i++) {
      const idx = dailyTarget(date, 'hr', 60);
      const previous = seen.get(idx);
      if (previous !== undefined) {
        expect(lastNDates(date, 30).includes(previous), `${date} ponavlja metu s ${previous}`).toBe(
          false,
        );
      }
      seen.set(idx, date);
      date = addDays(date, 1);
    }
  });

  it('radi i kad je bazen manji od prozora ponavljanja', () => {
    // Sa bazenom od 3 mete svaka se nuzno ponavlja; petlja ne smije visjeti.
    const idx = dailyTarget('2026-09-14', 'hr', 3);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(3);
  });

  it('prazan bazen je greska, ne tiha nula', () => {
    expect(() => dailyTarget('2026-09-14', 'world', 0)).toThrow();
  });

  it('datum prije epohe i dalje daje valjanu metu', () => {
    const idx = dailyTarget('2025-06-01', 'world', POOL);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(POOL);
  });

  it('rasporeduje mete po bazenu umjesto da se drzi jednog kraja', () => {
    const hits = new Set<number>();
    let date = '2026-01-01';
    for (let i = 0; i < 200; i++) {
      hits.add(dailyTarget(date, 'world', POOL));
      date = addDays(date, 1);
    }
    // 200 dana kroz bazen od 177 — ocekujemo siroku pokrivenost.
    expect(hits.size).toBeGreaterThan(100);
  });

  it('ostaje brz i deset godina nakon epohe', () => {
    const started = performance.now();
    dailyTarget('2036-01-01', 'world', POOL);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
