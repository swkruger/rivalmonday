// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type ReadinessData, ReadinessPanel } from './readiness-panel';

afterEach(cleanup);

const NOW = new Date('2026-10-24T17:00:00.000Z');
const DATA: ReadinessData = {
  checkedAt: NOW.toISOString(), deliveryDate: '2026-10-26',
  due: 12, ready: 5, approved: 3, sent: 0, missing: 2, failed: 1, awaitingApproval: 4, startingPointsLate: 1,
  issues: [
    { id: 'a1', checkpoint: 'generation_closed', timezone: 'America/Chicago', severity: 'critical', deliveryDate: '2026-10-26', clients: 3, firstSeenAt: '2026-10-23T17:25:00.000Z', emailedAt: '2026-10-24T15:00:00.000Z' },
    { id: 'a2', checkpoint: 'pre_delivery_unapproved', timezone: 'America/Chicago', severity: 'warning', deliveryDate: '2026-10-26', clients: 4, firstSeenAt: '2026-10-24T16:25:00.000Z', emailedAt: null },
  ],
};

describe('ReadinessPanel', () => {
  it('renders counts, a critical issue and the empty state', () => {
    const { rerender } = render(<ReadinessPanel data={DATA} now={NOW} tz="America/Chicago" />);
    const counts = screen.getByRole('list', { name: 'Brief counts' });
    const count = (label: string) => within(counts).getByText(label).closest('div')!.textContent;
    expect(count('Due')).toBe('Due12');
    expect(count('Missing')).toBe('Missing2');
    expect(count('Failed')).toBe('Failed1');
    expect(count('Awaiting approval')).toBe('Awaiting approval4');
    expect(count('Starting points late')).toBe('Starting points late1');

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Critical')).toBeTruthy();
    expect(within(rows[0]!).getByText('Not ready after generation closed')).toBeTruthy();
    expect(rows[0]!.textContent).toContain('Not ready after generation closed · America/Chicago');
    expect(within(rows[0]!).getByText('3')).toBeTruthy();
    expect(within(rows[0]!).getByText('emailed 2 h ago')).toBeTruthy();
    expect(within(rows[1]!).getByText('Warning')).toBeTruthy();
    expect(within(rows[1]!).getByText('not emailed yet')).toBeTruthy();
    expect(screen.queryByText('No readiness issues.')).toBeNull();

    rerender(<ReadinessPanel data={{ ...DATA, issues: [] }} now={NOW} tz="America/Chicago" />);
    expect(screen.getByText('No readiness issues.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('same checkpoint and delivery date in two zones: two rows (keyed by alert id), each naming its zone', () => {
    const same = { checkpoint: 'generation_closed', severity: 'critical' as const, deliveryDate: '2026-10-26', clients: 1, firstSeenAt: '2026-10-23T17:25:00.000Z', emailedAt: null };
    render(<ReadinessPanel data={{ ...DATA, issues: [{ ...same, id: 'x1', timezone: 'America/New_York' }, { ...same, id: 'x2', timezone: 'America/Denver' }] }} now={NOW} tz="America/Chicago" />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent?.includes('America/New_York') || r.textContent?.includes('America/Denver'))).toEqual([true, true]);
  });

  it('a starting-point issue shows no zone', () => {
    render(<ReadinessPanel data={{ ...DATA, issues: [{ id: 's1', checkpoint: 'starting_point_late', severity: 'critical', deliveryDate: '2026-10-26', clients: 1, firstSeenAt: '2026-10-23T17:25:00.000Z', emailedAt: null }] }} now={NOW} tz="America/Chicago" />);
    expect(screen.getAllByRole('row')[1]!.textContent).not.toContain(' · ');
  });

  it('null data (readiness queries failed) shows the unavailable line, not a crash', () => {
    render(<ReadinessPanel data={null} now={NOW} tz="America/Chicago" />);
    expect(screen.getByText(/Brief readiness unavailable/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Brief counts' })).toBeNull();
  });
});
