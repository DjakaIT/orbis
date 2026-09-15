import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildIndex } from '../src/engine/search';
import type { Place } from '../src/types';

/**
 * Cetiri izmisljene "drzave" u kvadratu; matrica je rucno postavljena.
 * Podaci se ne dohvacaju mrezom — testira se sucelje, ne pipeline.
 */
const PLACES: Place[] = [
  { id: 0, code: 'AAA', name: 'Alfa', lat: 0, lon: 0 },
  { id: 1, code: 'BBB', name: 'Beta', lat: 10, lon: 0 },
  { id: 2, code: 'CCC', name: 'Gama', lat: 0, lon: 10 },
  { id: 3, code: 'DDD', name: 'Delta', lat: -10, lon: 0 },
];

const MATRIX = new Uint16Array([
  0, 100, 200, 300, 100, 0, 400, 500, 200, 400, 0, 600, 300, 500, 600, 0,
]);

vi.mock('../src/data/load', () => ({
  loadWorld: () =>
    Promise.resolve({
      places: PLACES,
      n: 4,
      matrix: MATRIX,
      shapes: new Map<string, GeoJSON.Geometry>(),
      index: buildIndex(PLACES, { prva: 'Alfa' }),
    }),
  expandTriangle: () => new Uint16Array(),
}));

// WebGL ne postoji u jsdomu; globus se testira kroz render/, ne ovdje.
vi.mock('../src/components/Globe', () => ({ default: () => null }));

const { default: App } = await import('../src/App');

/**
 * Meta ovisi o danu, pa sat mora biti pinan — inace ovaj test prolazi ili pada
 * ovisno o tome kad se pokrene. Za 2026-03-03 `dailyTarget` nad bazenom od cetiri
 * daje indeks 1 (Beta), pa je Alfa promasaj na 100 km, Gama na 400 i Delta na 500.
 *
 * Lazira se samo `Date`; `setTimeout` ostaje pravi jer userEvent ceka na njemu.
 */
const PINNED = new Date('2026-03-03T12:00:00Z');

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(PINNED);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Ime pokusaja stoji na dva mjesta: u statusnom retku i u listi. Upiti zato
 * ciljaju redak liste, inace `getByText` pada na dva pogotka.
 */
function row(name: string): HTMLElement[] {
  return screen.queryAllByRole('listitem').filter((li) => li.textContent?.includes(name));
}

describe('App', () => {
  it('prikazuje wordmark i atribuciju izvora', async () => {
    render(<App />);
    expect(screen.getByText('Orbis')).toBeInTheDocument();
    expect(screen.getByText(/Natural Earth/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Upiši državu')).toBeEnabled();
    });
  });

  it('pogodak ispisuje udaljenost i smjer', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByLabelText('Upiši državu');
    await user.type(input, 'Alfa{Enter}');

    await waitFor(() => {
      expect(row('Alfa')).toHaveLength(1);
    });
    // Tanki razmak U+2009 je razdjelnik tisucica, pa se usporeduje sirovi tekst.
    expect(row('Alfa')[0]?.textContent).toContain(`100${String.fromCodePoint(0x2009)}km`);
  });

  it('oznaku pogotka nosi samo meta', async () => {
    // Meta je Beta. Alfa je promasaj i mora zadrzati strelicu, ne ✦.
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByLabelText('Upiši državu');
    await user.type(input, 'Alfa{Enter}');
    await waitFor(() => {
      expect(row('Alfa')).toHaveLength(1);
    });
    expect(row('Alfa')[0]?.textContent).not.toContain('✦');

    await user.type(input, 'Beta{Enter}');
    await waitFor(() => {
      expect(row('Beta')).toHaveLength(1);
    });
    expect(row('Beta')[0]?.textContent).toContain('✦');
    expect(screen.getByRole('status').textContent).toContain('pogodak');
  });

  it('poruka kaze je li pokusaj blizi od prethodnog', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByLabelText('Upiši državu');
    // Meta je Beta. Gama je od nje 400 km, Alfa 100 km, Delta 500 km.
    await user.type(input, 'Gama{Enter}');
    await waitFor(() => {
      expect(row('Gama')).toHaveLength(1);
    });
    expect(screen.getByRole('status').textContent).not.toContain('bliže');

    await user.type(input, 'Alfa{Enter}');
    await waitFor(() => {
      expect(row('Alfa')).toHaveLength(1);
    });
    expect(screen.getByRole('status').textContent).toContain('bliže nego prije');

    await user.type(input, 'Delta{Enter}');
    await waitFor(() => {
      expect(row('Delta')).toHaveLength(1);
    });
    expect(screen.getByRole('status').textContent).toContain('dalje nego prije');
  });

  it('neprepoznato ime ne trosi pokusaj', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByLabelText('Upiši državu');
    await user.type(input, 'Xyzzy{Enter}');

    expect(await screen.findByText(/Ne prepoznajem/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Pokušaji')).not.toBeInTheDocument();
  });

  it('alias pogađa istu metu kao puno ime', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByLabelText('Upiši državu');
    await user.type(input, 'prva{Enter}');

    await waitFor(() => {
      expect(row('Alfa')).toHaveLength(1);
    });
  });

  it('stanje preživi ponovno učitavanje', async () => {
    const user = userEvent.setup();
    const first = render(<App />);

    const input = await screen.findByLabelText('Upiši državu');
    await user.type(input, 'Beta{Enter}');
    await waitFor(() => {
      expect(row('Beta')).toHaveLength(1);
    });

    first.unmount();
    render(<App />);

    await waitFor(() => {
      expect(row('Beta')).toHaveLength(1);
    });
  });

  it('lista se prebacuje na kronološki poredak', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByLabelText('Upiši državu');
    await user.type(input, 'Alfa{Enter}');
    await waitFor(() => {
      expect(screen.getByText('po udaljenosti')).toBeInTheDocument();
    });

    await user.click(screen.getByText('po udaljenosti'));
    expect(screen.getByText('kronološki')).toBeInTheDocument();
  });
});
