// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-context';
import { ActivityFeed, type ActivityItem } from './activity-feed';
import { HealthPill } from './health-pill';
import { RangeToggle } from './range-toggle';

describe('HealthPill', () => {
  it.each([
    ['at_risk', 'At risk'],
    ['idle', 'Idle'],
    ['growing', 'Growing'],
    ['steady', 'Steady'],
  ] as const)('renders the %s label as text', (h, label) => {
    render(<HealthPill health={h} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe('RangeToggle', () => {
  it('marks the current range and links to the other', () => {
    render(<RangeToggle current="12m" basePath="/platform" />);
    expect(screen.getByRole('link', { name: '12 months' }).getAttribute('aria-current')).toBe('true');
    const other = screen.getByRole('link', { name: '12 weeks' });
    expect(other.getAttribute('aria-current')).toBeNull();
    expect(other.getAttribute('href')).toBe('/platform?range=12w');
  });
});

const item = (over: Partial<ActivityItem>): ActivityItem => ({ at: '2026-10-01T10:00:00.000Z', kind: 'agency_created', agencyId: 'a1', agencyName: 'Acme', ...over });

describe('ActivityFeed', () => {
  it('renders each kind, tolerating a missing client name', () => {
    render(
      <ActivityFeed
        initial={{
          items: [
            item({ kind: 'agency_created' }),
            item({ kind: 'client_created', clientName: 'Bob HVAC' }),
            item({ kind: 'client_activated' }),
            item({ kind: 'first_brief_sent' }),
            item({ kind: 'health_at_risk' }),
            item({ kind: 'support_session_started' }),
          ],
          nextCursor: null,
        }}
        loadMore={vi.fn()}
      />,
    );
    expect(screen.getByText(/signed up/i)).toBeTruthy();
    expect(screen.getByText(/Bob HVAC/)).toBeTruthy();
    expect(screen.getByText(/activated a client/i)).toBeTruthy();
    expect(screen.getByText(/first brief/i)).toBeTruthy();
    expect(screen.getByText(/at risk/i)).toBeTruthy();
    expect(screen.getByText(/support session opened/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('shows "Show more" only with a cursor and appends the next page', async () => {
    const loadMore = vi.fn(async (_c: string) => ({ items: [item({ agencyName: 'Zed Co', agencyId: 'z' })], nextCursor: null }));
    render(<ActivityFeed initial={{ items: [item({})], nextCursor: 'c1' }} loadMore={loadMore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(screen.getByText(/Zed Co/)).toBeTruthy());
    expect(loadMore).toHaveBeenCalledWith('c1');
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('shows an empty message', () => {
    render(<HelpProvider value={{ audience: 'operator', names: { agency: 'your agency', assistant: 'Sunny' } }}><ActivityFeed initial={{ items: [], nextCursor: null }} loadMore={vi.fn()} /></HelpProvider>);
    expect(screen.getByText('No activity yet')).toBeTruthy();
  });
});
