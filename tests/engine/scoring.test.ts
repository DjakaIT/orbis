import { describe, expect, it } from 'vitest';

import { compareStandings, points, type StandingRow } from '../../src/engine/scoring';

describe('points', () => {
  it('slijedi tablicu iz SPEC 5.6', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(points)).toEqual([10, 8, 6, 5, 4, 3, 2]);
  });

  it('osam i vise pokusaja vrijedi 1 bod', () => {
    expect(points(8)).toBe(1);
    expect(points(40)).toBe(1);
  });

  it('neodigrano je 0', () => {
    expect(points(0)).toBe(0);
    expect(points(-1)).toBe(0);
  });

  it('oba moda zajedno daju najvise 20 bodova dnevno', () => {
    expect(points(1) + points(1)).toBe(20);
  });
});

const row = (o: Partial<StandingRow>): StandingRow => ({
  playerId: 'p',
  nickname: 'Netko',
  points: 0,
  guesses: 0,
  elapsedMs: 0,
  playedToday: false,
  ...o,
});

describe('compareStandings', () => {
  it('prvo vise bodova', () => {
    expect(compareStandings(row({ points: 70 }), row({ points: 60 }))).toBeLessThan(0);
  });

  it('pa manje ukupnih pokusaja', () => {
    const a = row({ points: 70, guesses: 12 });
    const b = row({ points: 70, guesses: 15 });
    expect(compareStandings(a, b)).toBeLessThan(0);
  });

  it('pa krace vrijeme', () => {
    const a = row({ points: 70, guesses: 12, elapsedMs: 40_000 });
    const b = row({ points: 70, guesses: 12, elapsedMs: 90_000 });
    expect(compareStandings(a, b)).toBeLessThan(0);
  });

  it('pa abecedno po hrvatskoj abecedi', () => {
    const a = row({ nickname: 'Ćiro' });
    const b = row({ nickname: 'Dado' });
    expect(compareStandings(a, b)).toBeLessThan(0);
  });

  it('sortira cijelu ljestvicu iz SPEC 7.6', () => {
    const rows = [
      row({ nickname: 'Luka', points: 40, guesses: 22 }),
      row({ nickname: 'Daniel', points: 74, guesses: 12 }),
      row({ nickname: 'Tomislav', points: 38, guesses: 11 }),
      row({ nickname: 'Marta', points: 68, guesses: 15 }),
    ];
    expect([...rows].sort(compareStandings).map((r) => r.nickname)).toEqual([
      'Daniel',
      'Marta',
      'Luka',
      'Tomislav',
    ]);
  });
});
