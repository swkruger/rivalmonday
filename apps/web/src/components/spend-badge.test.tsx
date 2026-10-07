// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpendBadge } from './spend-badge';

describe('SpendBadge', () => {
  it('shows the percentage and a warning/over label', () => {
    const { rerender } = render(<SpendBadge spend={{ monthToDateUsd: 3, capUsd: 15, ratio: 0.2, level: 'ok' }} />);
    expect(screen.getByText('20%')).toBeTruthy();
    rerender(<SpendBadge spend={{ monthToDateUsd: 12.5, capUsd: 15, ratio: 12.5 / 15, level: 'warning' }} />);
    expect(screen.getByText(/83% · near cap/)).toBeTruthy();
    rerender(<SpendBadge spend={{ monthToDateUsd: 16, capUsd: 15, ratio: 16 / 15, level: 'over' }} />);
    expect(screen.getByText(/107% · over cap/)).toBeTruthy();
  });
});
