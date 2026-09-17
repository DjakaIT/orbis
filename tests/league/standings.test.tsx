import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Standings from '../../src/components/league/Standings';
import type { LeagueView, StandingRow } from '../../src/league/types';

/**
 * Ljestvica ima tri tablice, jednu po modu.
 *
 * Prije je bila jedna sa zbrojem svih modova, pa se iz retka nije vidjelo tko je
 * u čemu bolji — pogodak iz glavnih gradova dizao je isti broj kao pogodak iz
 * država. Ovi testovi drže tu podjelu na mjestu.
 */

const row = (o: Partial<StandingRow> & { nickname: string; rank: number }): StandingRow => ({
  playerId: o.nickname.toLowerCase(),
  points: 0,
  guesses: 0,
  elapsedMs: 0,
  playedToday: false,
  ...o,
});

function view(standings: Partial<LeagueView['standings']>): LeagueView {
  return {
    name: 'Ekipa',
    code: 'ABCDEF',
    round_id: '2026-09-18',
    closes_at: Date.parse('2026-09-18T15:00:00Z'),
    standings: { world: [], capitals: [], hr: [], ...standings },
    everyone_done: false,
    revealed: true,
  };
}

describe('Standings', () => {
  it('prikazuje tablicu po modu, s vlastitim poretkom', () => {
    render(
      <Standings
        meId="ana"
        view={view({
          world: [
            row({ nickname: 'Ana', rank: 1, points: 10 }),
            row({ nickname: 'Bruno', rank: 2, points: 4 }),
          ],
          capitals: [
            row({ nickname: 'Bruno', rank: 1, points: 8 }),
            row({ nickname: 'Ana', rank: 2, points: 2 }),
          ],
        })}
      />,
    );

    // Ista dva igrača, obrnut poredak — to je cijela poanta podjele.
    const world = screen.getByRole('heading', { name: 'Države' }).parentElement;
    const capitals = screen.getByRole('heading', { name: 'Glavni gradovi' }).parentElement;

    expect(within(world!).getAllByRole('listitem')[0]?.textContent).toContain('Ana');
    expect(within(capitals!).getAllByRole('listitem')[0]?.textContent).toContain('Bruno');
  });

  it('prazan mod se ne prikazuje kao prazna tablica', () => {
    render(
      <Standings
        meId={null}
        view={view({ world: [row({ nickname: 'Ana', rank: 1, points: 10 })] })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Države' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hrvatska' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Glavni gradovi' })).not.toBeInTheDocument();
  });

  it('kvačica prati mod u kojem stoji', () => {
    render(
      <Standings
        meId={null}
        view={view({
          world: [row({ nickname: 'Ana', rank: 1, points: 10, playedToday: true })],
          hr: [row({ nickname: 'Ana', rank: 1, points: 0, playedToday: false })],
        })}
      />,
    );

    const world = screen.getByRole('heading', { name: 'Države' }).parentElement;
    const hr = screen.getByRole('heading', { name: 'Hrvatska' }).parentElement;

    expect(within(world!).getByLabelText('odigrao danas')).toBeInTheDocument();
    expect(within(hr!).getByLabelText('nije još')).toBeInTheDocument();
  });

  it('dok igrač nije odigrao, stoji zašto su tuđi rezultati skriveni', () => {
    render(
      <Standings
        meId={null}
        view={{
          ...view({ world: [row({ nickname: 'Ana', rank: 1 })] }),
          revealed: false,
        }}
      />,
    );

    expect(screen.getByText(/otključavaju se kad sam odigraš/)).toBeInTheDocument();
  });
});
