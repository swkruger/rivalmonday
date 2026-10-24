// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { pendingStartingPoint, StartingPointCard } from './starting-point-card';

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

  it('starting point review link names the brief', () => {
    render(<StartingPointCard agency reviewHref="/agency/approvals/b9" status={{ state: 'ready_for_review' }} />);
    expect(screen.getByRole('link', { name: 'Review it' }).getAttribute('href')).toBe('/agency/approvals/b9');
  });

  it('agency does not see the review link while still preparing', () => {
    render(<StartingPointCard agency status={{ state: 'preparing', checks: { profile: false, reviews: false, rankings: null, competitors: null } }} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('pendingStartingPoint', () => {
  const ready = { state: 'ready_for_review' as const };
  it('shows the card until the starting point is sent, unless weekly briefs already arrive', () => {
    expect(pendingStartingPoint(ready, [])).toBe(ready);
    expect(pendingStartingPoint(ready, [{ kind: 'starting_point' }])).toBe(ready);
    expect(pendingStartingPoint(ready, [{ kind: 'standard' }])).toBeNull();
    expect(pendingStartingPoint({ state: 'sent', briefId: '00000000-0000-4000-8000-0000000000b1' }, [])).toBeNull();
    expect(pendingStartingPoint(null, [])).toBeNull();
  });
});
