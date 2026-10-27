// @vitest-environment jsdom
import type { EventRow } from '@cs/tools';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChangesParams } from './params';

vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
const { FeedList, FilterBar, RoutePill } = await import('./feed');

const row = (eventId: string, route: EventRow['route'] = 'alert'): EventRow =>
  ({ eventId, competitorName: 'Peachtree', summary: `S-${eventId}`, typeLabel: 'Price change', channels: ['web', 'google_ads'], occurredAt: '2026-10-22T03:30:00Z', score: 82, route }) as unknown as EventRow;
const params: ChangesParams = { route: 'flagged', days: 30, offset: 0, tab: 'side' };
const list = (currentId: string | null, timezone = 'UTC') =>
  render(<FeedList clientId="c" params={params} groups={[{ label: 'This week', items: [row('e1'), row('e2')] }]} selectedId="e1" currentId={currentId} timezone={timezone} />);

describe('RoutePill', () => {
  it('route pill is a status chip with the score aria-label', () => {
    const { container } = render(<RoutePill route="alert" score={82} />);
    const chip = container.querySelector('[data-slot="status-chip"]')!;
    expect(chip.getAttribute('data-tone')).toBe('danger');
    expect(chip.getAttribute('title')).toBe('Score 82, routed to alert');
    expect(chip.textContent).toContain('Score 82, routed to alert');
    expect(chip.textContent).toContain('Alert');
  });
});

describe('FeedList', () => {
  it('channels render as labels (Website, Google ads)', () => {
    list(null);
    expect(screen.getAllByText(/Website, Google ads/).length).toBe(2);
    expect(document.body.textContent).not.toContain('google_ads');
  });

  it('auto-selected row has no aria-current; ?event row has aria-current="true"', () => {
    const { unmount } = list(null);
    expect(document.querySelectorAll('[aria-current]').length).toBe(0);
    unmount();
    list('e2');
    const marked = document.querySelectorAll('[aria-current="true"]');
    expect(marked.length).toBe(1);
    expect(marked[0]!.getAttribute('href')).toContain('event=e2');
  });

  it('feed row date uses the client zone', () => {
    // 03:30 UTC on Oct 22 is still Oct 21 in New York.
    list(null, 'America/New_York');
    expect(screen.getAllByText(/Oct 21/).length).toBe(2);
    expect(document.body.textContent).not.toContain('Oct 22');
  });
});

describe('FilterBar', () => {
  const bar = (route: ChangesParams['route'] = 'flagged') =>
    render(<FilterBar clientId="c" params={{ ...params, route, offset: 50, event: 'e1' }} competitors={[{ id: 'k', name: 'K' }]} types={[{ id: 't', label: 'T' }]} services={[{ id: 's', name: 'S' }]} />);

  it('route links keep hrefs, drop offset/event, exactly one aria-current=page', () => {
    bar('all');
    const all = screen.getByRole('link', { name: 'All' });
    expect(all.getAttribute('href')).toContain('route=all');
    expect(all.getAttribute('href')).not.toMatch(/offset=|event=/);
    expect(document.querySelectorAll('[aria-current="page"]').length).toBe(1);
    expect(all.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Alerts + brief' }).getAttribute('aria-current')).toBeNull();
  });

  it('form keeps field names and hidden route; Apply is not the primary button', () => {
    const { container } = bar();
    const form = container.querySelector('form')!;
    const names = Array.from(form.querySelectorAll('input,select')).map((e) => e.getAttribute('name'));
    expect(names).toEqual(['route', 'q', 'competitor', 'type', 'service', 'days']);
    expect((form.querySelector('input[name=route]') as HTMLInputElement).value).toBe('flagged');
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply.getAttribute('data-variant')).not.toBe('default');
  });
});

describe('FeedList rows', () => {
  it('rows carry data-row-id', () => {
    list(null);
    expect(Array.from(document.querySelectorAll('a[data-row-id]')).map((a) => a.getAttribute('data-row-id'))).toEqual(['e1', 'e2']);
  });
});
