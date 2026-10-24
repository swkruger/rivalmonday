// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpendBadge } from './spend-badge';

describe('SpendBadge', () => {
  it('badge labels and calm classes for each level', () => {
    const { rerender, container } = render(<SpendBadge credits={{ used: 300, limit: 1500, ratio: 0.2, level: 'ok' }} />);
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.queryByText(/limit|paused/i)).toBeNull();
    rerender(<SpendBadge credits={{ used: 1250, limit: 1500, ratio: 1250 / 1500, level: 'near' }} />);
    expect(screen.getByText('Near limit')).toBeTruthy();
    rerender(<SpendBadge credits={{ used: 1600, limit: 1500, ratio: 1600 / 1500, level: 'reached' }} />);
    expect(screen.getByText('Limit reached')).toBeTruthy();
    rerender(<SpendBadge credits={{ used: 2000, limit: 1500, ratio: 2000 / 1500, level: 'paused' }} />);
    const paused = screen.getByText('Paused');
    expect(paused.className).toContain('bg-muted-surface');
    expect(paused.className).toContain('text-secondary');
    expect(container.innerHTML).not.toMatch(/amber|destructive|orange|red/);
  });

  it('every non-ok level uses the calm classes; ok shows only the percentage', () => {
    for (const level of ['near', 'reached', 'paused'] as const) {
      const { container, unmount } = render(<SpendBadge credits={{ used: 1, limit: 1, ratio: 1, level }} />);
      expect(container.firstElementChild!.className).toContain('bg-muted-surface text-secondary');
      unmount();
    }
    const { container } = render(<SpendBadge credits={{ used: 0, limit: 1500, ratio: 0, level: 'ok' }} />);
    expect(container.textContent).toBe('0%');
  });
});
