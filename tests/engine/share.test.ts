import { describe, expect, it } from 'vitest';

import { guessNoun, shareText } from '../../src/engine/share';

describe('guessNoun', () => {
  it('jedan pokusaj je jednina', () => {
    expect(guessNoun(1)).toBe('pokušaj');
    expect(guessNoun(21)).toBe('pokušaj');
  });

  it('jedanaest je iznimka', () => {
    expect(guessNoun(11)).toBe('pokušaja');
  });

  it('sve ostalo je genitiv', () => {
    expect([2, 3, 4, 5, 8, 100].map(guessNoun)).toEqual(Array<string>(6).fill('pokušaja'));
  });
});

describe('shareText', () => {
  const guesses = [{ km: 19000 }, { km: 9000 }, { km: 2000 }, { km: 0 }];

  it('slijedi oblik iz SPEC 7.6', () => {
    expect(shareText('2026-09-15', guesses, 'world')).toBe(
      'Orbis \u{1F30D} 15.9. — 4 pokušaja\n\u{1F7E6}\u{1F7E7}\u{1F7E8}\u{1F7E9}\norbis.hr',
    );
  });

  it('datum je bez vodecih nula', () => {
    expect(shareText('2026-01-05', [{ km: 0 }], 'world')).toContain(' 5.1. ');
  });

  it('kvadratici idu kronoloski, ne po udaljenosti', () => {
    const [, squares] = shareText('2026-09-15', guesses, 'world').split('\n');
    // Najdalji pogodak je prvi upisan, pa je i prvi kvadratic.
    expect(squares?.startsWith('\u{1F7E6}')).toBe(true);
    expect(squares?.endsWith('\u{1F7E9}')).toBe(true);
  });

  it('mod hr ima svoju zastavu i svoju skalu', () => {
    const text = shareText('2026-09-15', [{ km: 300 }], 'hr');
    expect(text).toContain('\u{1F1ED}\u{1F1F7}');
    // 300 km je na hrvatskoj skali daleko, na svjetskoj blizu.
    expect(text).not.toBe(shareText('2026-09-15', [{ km: 300 }], 'world'));
  });

  it('jedan pokusaj je jednina', () => {
    expect(shareText('2026-09-15', [{ km: 0 }], 'world')).toContain('1 pokušaj\n');
  });
});
