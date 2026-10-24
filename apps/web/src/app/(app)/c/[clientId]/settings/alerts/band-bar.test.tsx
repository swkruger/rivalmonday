// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BandBar } from './band-bar';

afterEach(cleanup);

describe('BandBar', () => {
  it('band bar ranges for brief 40 / alert 70: 0–39, 40–69, 70–100', () => {
    render(<BandBar brief={40} alert={70} />);
    expect(screen.getByText('0–39')).toBeTruthy();
    expect(screen.getByText('40–69')).toBeTruthy();
    expect(screen.getByText('70–100')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(screen.getByText('Weekly brief')).toBeTruthy();
    expect(screen.getByText('Instant alert')).toBeTruthy();
  });
  it('aria-label states all three ranges', () => {
    render(<BandBar brief={40} alert={70} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Scores 0 to 39: archived. 40 to 69: weekly brief. 70 to 100: instant alert.');
  });
  it('re-renders with new values', () => {
    const { rerender } = render(<BandBar brief={40} alert={70} />);
    rerender(<BandBar brief={10} alert={90} />);
    expect(screen.getByText('0–9')).toBeTruthy();
    expect(screen.getByText('10–89')).toBeTruthy();
    expect(screen.getByText('90–100')).toBeTruthy();
  });
});
