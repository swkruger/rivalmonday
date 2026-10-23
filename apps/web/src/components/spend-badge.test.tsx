// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpendBadge } from './spend-badge';

describe('SpendBadge', () => {
  it('shows the percentage and a near/reached/paused label, never red or orange', () => {
    const { rerender, container } = render(<SpendBadge credits={{ used: 300, limit: 1500, ratio: 0.2, level: 'ok' }} />);
    expect(screen.getByText('20%')).toBeTruthy();
    rerender(<SpendBadge credits={{ used: 1250, limit: 1500, ratio: 1250 / 1500, level: 'near' }} />);
    expect(screen.getByText(/83% · near limit/)).toBeTruthy();
    rerender(<SpendBadge credits={{ used: 1600, limit: 1500, ratio: 1600 / 1500, level: 'reached' }} />);
    expect(screen.getByText(/107% · limit reached/)).toBeTruthy();
    rerender(<SpendBadge credits={{ used: 2000, limit: 1500, ratio: 2000 / 1500, level: 'paused' }} />);
    expect(screen.getByText(/133% · paused/)).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/amber|destructive|orange|red/);
  });
});
