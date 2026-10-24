// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Timeline } from './timeline';

const C = '11111111-1111-4111-8111-111111111111';
const items = [
  { kind: 'move' as const, id: 'm1', at: '2026-10-06T00:00:00Z', title: 'Two price cuts in 30 days', label: 'Price war', score: null, route: null, status: 'active' },
  { kind: 'event' as const, id: 'e1', at: '2026-10-05T00:00:00Z', title: 'AC tune-up $99 → $79', label: 'Price change', score: 86, route: 'alert' as const, status: null },
  { kind: 'event' as const, id: 'e2', at: '2026-09-20T00:00:00Z', title: 'Hiring a technician', label: 'Hiring', score: 41, route: 'brief' as const, status: null },
];

describe('Timeline', () => {
  it('groups by month and links events and moves', () => {
    render(<Timeline clientId={C} items={items} timezone="UTC" />);
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /AC tune-up/ }).getAttribute('href')).toBe(`/c/${C}/changes?route=all&days=365&event=e1`);
    expect(screen.getByRole('link', { name: /Two price cuts/ }).getAttribute('href')).toBe(`/c/${C}/moves?status=all&move=m1`);
  });
  it('groups by the client\u2019s month (a 2026-11-01T03:00Z item is October in Chicago)', () => {
    const late = [{ kind: 'event' as const, id: 'e3', at: '2026-11-01T03:00:00Z', title: 'Late change', label: 'Price change', score: 50, route: 'brief' as const, status: null }];
    const { unmount } = render(<Timeline clientId={C} items={late} timezone="America/Chicago" />);
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy();
    unmount();
    render(<Timeline clientId={C} items={late} timezone="UTC" />);
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy();
  });
  it('shows a move\u2019s status as a labelled chip, not a raw word', () => {
    render(<Timeline clientId={C} items={items} timezone="UTC" />);
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.queryByText('active')).toBeNull();
  });
  it('has an empty state', () => {
    render(<Timeline clientId={C} items={[]} timezone="UTC" />);
    expect(screen.getByText('No changes from this competitor in this period.')).toBeTruthy();
  });
});
