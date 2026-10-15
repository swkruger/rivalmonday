// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StartingPointCard } from './starting-point-card';

describe('StartingPointCard', () => {
  it('shows the four checks: done, in progress and not needed', () => {
    render(<StartingPointCard agency={false} status={{ state: 'preparing', checks: { profile: true, reviews: false, rankings: null, competitors: false } }} />);
    expect(screen.getByText('Preparing your starting point')).toBeTruthy();
    for (const l of ['Your Google profile', 'Your reviews', 'Map rankings', 'Competitors']) expect(screen.getByText(l)).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
    expect(screen.getAllByText('In progress')).toHaveLength(2);
    expect(screen.getByText('Not needed')).toBeTruthy();
  });

  it('ready for review: all checks done; the approvals link is for agency users only', () => {
    const { unmount } = render(<StartingPointCard agency status={{ state: 'ready_for_review' }} />);
    expect(screen.getAllByText('✓')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Review it' }).getAttribute('href')).toBe('/agency/approvals');
    unmount();
    render(<StartingPointCard agency={false} status={{ state: 'ready_for_review' }} />);
    expect(screen.getAllByText('✓')).toHaveLength(4);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('agency does not see the review link while still preparing', () => {
    render(<StartingPointCard agency status={{ state: 'preparing', checks: { profile: false, reviews: false, rankings: null, competitors: null } }} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
