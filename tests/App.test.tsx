import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from '../src/App';

describe('App', () => {
  it('prikazuje wordmark', () => {
    render(<App />);
    expect(screen.getByText('Orbis')).toBeInTheDocument();
  });

  it('navodi atribuciju izvora podataka', () => {
    render(<App />);
    expect(screen.getByText(/Natural Earth/)).toBeInTheDocument();
  });
});
