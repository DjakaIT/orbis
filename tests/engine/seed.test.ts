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

  it('u jednom krugu prodje kroz SVE mete, svaku tocno jednom', () => {
    /*
     * Ovo je razlog zasto niz vise nije hash po danu. Stari racun je u prvih 177
     * dana pokazao 119 od 177 drzava: 58 ih se nije pojavilo nijednom, a neke po
     * tri puta. Sada je jedan krug jedna permutacija bazena.
     */
    const counts = new Map<number, number>();
    let date = '2026-01-01';
    for (let i = 0; i < POOL; i++) {
      const idx = dailyTarget(date, 'world', POOL);
      counts.set(idx, (counts.get(idx) ?? 0) + 1);
      date = addDays(date, 1);
    }

    expect(counts.size).toBe(POOL);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
  });

  it('sljedeci krug opet prodje kroz sve, ali drugim redom', () => {
    const cycle = (start: string): number[] => {
      const out: number[] = [];
      let date = start;
      for (let i = 0; i < POOL; i++) {
        out.push(dailyTarget(date, 'world', POOL));
        date = addDays(date, 1);
      }
      return out;
    };

    const first = cycle('2026-01-01');
    const second = cycle(addDays('2026-01-01', POOL));

    expect([...second].sort((a, b) => a - b)).toEqual([...first].sort((a, b) => a - b));
    expect(second).not.toEqual(first);
  });

  it('pokrivenost vrijedi i za manji bazen', () => {
    const counts = new Map<number, number>();
    let date = '2026-01-01';
    for (let i = 0; i < 71; i++) {
      const idx = dailyTarget(date, 'hr', 71);
      counts.set(idx, (counts.get(idx) ?? 0) + 1);
      date = addDays(date, 1);
    }
    expect(counts.size).toBe(71);
  });

  it('prijelaz iz kruga u krug ne ponavlja metu', () => {
    // Najosjetljivije mjesto: drzava koja zatvara jedan krug ne smije otvoriti
    // sljedeci. Provjerava se 40 dana oko granice, sire od prozora od 30.
    const boundary = addDays('2026-01-01', POOL);
    const seen = new Map<number, string>();
    let date = addDays(boundary, -40);

    for (let i = 0; i < 80; i++) {
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

  it('ostaje brz i deset godina nakon epohe', () => {
    const started = performance.now();
    dailyTarget('2036-01-01', 'world', POOL);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('jamstva pod pritiskom', () => {
  /**
   * Prijelaz iz kruga u krug je jedino mjesto gdje se meta uopce moze ponoviti,
   * i lako je promasiti ga na jednom bazenu a pogoditi na drugom. Bazen od 60
   * je pao dok je rep prethodnog kruga citan iz sirovog poretka, a bazen od 177
   * je prolazio — zato se ovdje provlaci vise velicina odjednom.
   */
  const POOLS = [60, 61, 71, 100, 177, 195, 624];

  for (const pool of POOLS) {
    it(`bazen od ${String(pool)}: bez ponavljanja unutar 30 dana kroz tri kruga`, () => {
      const seen = new Map<number, number>();
      let date = '2026-01-01';

      for (let day = 0; day < pool * 3; day++) {
        const idx = dailyTarget(date, 'world', pool);
        const previous = seen.get(idx);
        if (previous !== undefined) {
          expect(day - previous, `bazen ${String(pool)}, dan ${String(day)}`).toBeGreaterThan(30);
        }
        seen.set(idx, day);
        date = addDays(date, 1);
      }
    });

    it(`bazen od ${String(pool)}: svaki krug pokrije cijeli bazen`, () => {
      let date = '2026-01-01';
      for (let cycle = 0; cycle < 3; cycle++) {
        const hits = new Set<number>();
        for (let i = 0; i < pool; i++) {
          hits.add(dailyTarget(date, 'world', pool));
          date = addDays(date, 1);
        }
        expect(hits.size, `bazen ${String(pool)}, krug ${String(cycle)}`).toBe(pool);
      }
    });
  }

  it('premali bazen trguje prozorom za pokrivenost, i to svjesno', () => {
    /*
     * Ispod 2 * 30 mjesta jamstvo se kosi sa samim sobom: da svaka meta dode na
     * red jednom u N dana a razmak ostane veci od 30, nijedna se ne bi smjela
     * pomaknuti unaprijed za vise od N - 30 mjesta — pri N = 31 to je samo
     * identitet, isti poredak svaki krug. Pokrivenost je tada vaznija.
     *
     * Nijedan stvarni bazen nije ovoliko malen (71, 177, 624), ali funkcija ne
     * smije puknuti ni dati istu metu dva dana zaredom.
     */
    for (const pool of [31, 45]) {
      const hits = new Set<number>();
      let date = '2026-01-01';
      let last = -1;

      for (let i = 0; i < pool * 2; i++) {
        const idx = dailyTarget(date, 'world', pool);
        expect(idx, `bazen ${String(pool)}`).not.toBe(last);
        if (i < pool) hits.add(idx);
        last = idx;
        date = addDays(date, 1);
      }
      expect(hits.size, `bazen ${String(pool)}`).toBe(pool);
    }
  });

  it('niz je neprekinut i preko epohe unatrag', () => {
    // Datumi prije epohe nisu u igri, ali ne smiju rusiti racun ni davati indeks
    // izvan bazena — negativan ostatak je klasican nacin da se to pokvari.
    let date = '2025-06-01';
    for (let i = 0; i < 120; i++) {
      const idx = dailyTarget(date, 'world', POOL);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(POOL);
      date = addDays(date, 1);
    }
  });

  it('ista meta za isti dan bez obzira na redoslijed pitanja', () => {
    // Poredak se gradi u lancu i pamti; pitanje za daleki dan prije bliskog ne
    // smije promijeniti odgovor.
    const far = dailyTarget('2031-07-04', 'world', POOL);
    const near = dailyTarget('2026-02-02', 'world', POOL);
    expect(dailyTarget('2031-07-04', 'world', POOL)).toBe(far);
    expect(dailyTarget('2026-02-02', 'world', POOL)).toBe(near);
  });
});
