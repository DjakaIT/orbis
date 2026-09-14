import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  localStorage.clear();
});

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
      expect(screen.getByText('Alfa')).toBeInTheDocument();
    });
    // Tanki razmak U+2009 je razdjelnik tisucica; getByText ga inace normalizira.
    expect(screen.getByText('100 km', { normalizer: (t) => t })).toBeInTheDocument();
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
      expect(screen.getByText('Alfa')).toBeInTheDocument();
    });
  });

  it('stanje preživi ponovno učitavanje', async () => {
    const user = userEvent.setup();
    const first = render(<App />);

    const input = await screen.findByLabelText('Upiši državu');
    await user.type(input, 'Beta{Enter}');
    await waitFor(() => {
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    first.unmount();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Beta')).toBeInTheDocument();
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
