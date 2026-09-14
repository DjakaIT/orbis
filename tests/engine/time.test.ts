import { describe, expect, it } from 'vitest';

import {
  addDays,
  daysBetween,
  isTodayOrYesterday,
  lastNDates,
  msUntilNextPuzzle,
  roundClosesAt,
  roundIdFor,
  zagrebDate,
  zagrebHour,
  zagrebWeekday,
} from '../../src/engine/time';

/** 2026-09-14 je ponedjeljak. Ljetno vrijeme: Zagreb je UTC+2. */
const MON_SEP_14 = new Date('2026-09-14T10:00:00Z');

describe('zagrebDate', () => {
  it('vraća YYYY-MM-DD', () => {
    expect(zagrebDate(MON_SEP_14)).toBe('2026-09-14');
  });

  it('ponoć po zagrebačkom je već sljedeći dan, iako je u UTC-u još jučer', () => {
    // 22:30 UTC ljeti = 00:30 sljedećeg dana u Zagrebu.
    expect(zagrebDate(new Date('2026-09-14T22:30:00Z'))).toBe('2026-09-15');
  });

  it('zimi je pomak sat manji', () => {
    // 23:30 UTC zimi = 00:30 sljedećeg dana u Zagrebu.
    expect(zagrebDate(new Date('2026-01-14T23:30:00Z'))).toBe('2026-01-15');
    expect(zagrebDate(new Date('2026-01-14T22:30:00Z'))).toBe('2026-01-14');
  });
});

describe('zagrebHour', () => {
  it('čita zagrebački sat, ne UTC', () => {
    expect(zagrebHour(MON_SEP_14)).toBe(12); // ljeti UTC+2
    expect(zagrebHour(new Date('2026-01-14T10:00:00Z'))).toBe(11); // zimi UTC+1
  });
});

describe('zagrebWeekday', () => {
  it('1 je ponedjeljak, 7 nedjelja', () => {
    expect(zagrebWeekday(MON_SEP_14)).toBe(1);
    expect(zagrebWeekday(new Date('2026-09-18T10:00:00Z'))).toBe(5); // petak
    expect(zagrebWeekday(new Date('2026-09-20T10:00:00Z'))).toBe(7); // nedjelja
  });
});

describe('roundIdFor', () => {
  it('runda tjedna završava nadolazećim petkom', () => {
    expect(roundIdFor(MON_SEP_14)).toBe('2026-09-18');
  });

  it('petak prije 17:00 pripada rundi koja se zatvara isti dan', () => {
    // 14:00 UTC = 16:00 u Zagrebu.
    expect(roundIdFor(new Date('2026-09-18T14:00:00Z'))).toBe('2026-09-18');
  });

  it('petak nakon 17:00 već je u sljedećoj rundi', () => {
    // 15:30 UTC = 17:30 u Zagrebu.
    expect(roundIdFor(new Date('2026-09-18T15:30:00Z'))).toBe('2026-09-25');
  });

  it('subota pripada rundi koja se zatvara za šest dana', () => {
    expect(roundIdFor(new Date('2026-09-19T10:00:00Z'))).toBe('2026-09-25');
  });
});

describe('roundClosesAt', () => {
  it('pogađa 17:00 po zagrebačkom, ne po UTC-u', () => {
    expect(new Date(roundClosesAt('2026-09-18')).toISOString()).toBe('2026-09-18T15:00:00.000Z');
  });

  it('zimi je isti zidni sat sat kasnije u UTC-u', () => {
    expect(new Date(roundClosesAt('2026-01-16')).toISOString()).toBe('2026-01-16T16:00:00.000Z');
  });
});

describe('msUntilNextPuzzle', () => {
  it('broji do zagrebačke ponoći', () => {
    // 22:00 u Zagrebu → dva sata do ponoći.
    const ms = msUntilNextPuzzle(new Date('2026-09-14T20:00:00Z'));
    expect(ms).toBe(2 * 3600_000);
  });

  it('na dan prelaska na zimsko vrijeme dan traje 25 sati', () => {
    // Prelazak je 2026-10-25 u 03:00 → 02:00. Ponoć 24. → ponoć 25. je 25 h.
    const ms = msUntilNextPuzzle(new Date('2026-10-24T22:00:00Z')); // 00:00 u Zagrebu 25.
    expect(ms).toBe(25 * 3600_000);
  });
});

describe('aritmetika datuma', () => {
  it('addDays prelazi mjesece i godine', () => {
    expect(addDays('2026-09-14', 1)).toBe('2026-09-15');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // prijestupna
  });

  it('daysBetween je razlika u kalendarskim danima', () => {
    expect(daysBetween('2026-09-14', '2026-09-18')).toBe(4);
    expect(daysBetween('2026-09-18', '2026-09-14')).toBe(-4);
    // Prelazak na zimsko vrijeme ne smije dati 0,96 dana.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('lastNDates vraća prethodne dane, najnoviji prvi', () => {
    expect(lastNDates('2026-09-14', 3)).toEqual(['2026-09-13', '2026-09-12', '2026-09-11']);
  });
});

describe('isTodayOrYesterday', () => {
  it('prihvaća današnji i jučerašnji zagrebački dan', () => {
    expect(isTodayOrYesterday('2026-09-14', MON_SEP_14)).toBe(true);
    expect(isTodayOrYesterday('2026-09-13', MON_SEP_14)).toBe(true);
    expect(isTodayOrYesterday('2026-09-12', MON_SEP_14)).toBe(false);
    expect(isTodayOrYesterday('2026-09-15', MON_SEP_14)).toBe(false);
  });
});
