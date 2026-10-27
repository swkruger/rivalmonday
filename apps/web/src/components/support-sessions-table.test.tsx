// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SupportSessionsTable } from './support-sessions-table';

afterEach(cleanup);

const rows = [
  { id: 'a', startedAt: '2026-10-20T10:00:00Z', endedAt: '2026-10-20T10:30:00Z', platformUserName: 'Pat Ops', reason: 'Billing question', durationMinutes: 30, endReason: 'exit' as const },
  { id: 'b', startedAt: '2026-10-21T10:00:00Z', endedAt: null, platformUserName: 'Sam Ops', reason: 'Setup help', durationMinutes: null, endReason: null },
];

describe('SupportSessionsTable', () => {
  it('rows are found by role and name, with the end reason spelled out', () => {
    render(<SupportSessionsTable rows={rows} empty="None" tz="UTC" />);
    const row = screen.getByRole('row', { name: /Pat Ops/ });
    expect(within(row).getByRole('cell', { name: 'Exited' })).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /Sam Ops/ })).getByRole('cell', { name: 'Open' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(6);
  });
  it('shows the empty line when there are no rows', () => {
    render(<SupportSessionsTable rows={[]} empty="No sessions yet." tz="UTC" />);
    expect(screen.getByText('No sessions yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
