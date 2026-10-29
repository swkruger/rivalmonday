// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ inviteAgenciesAction: vi.fn(), declineWaitlistEntryAction: vi.fn() }));
const { WaitlistTable } = await import('./waitlist-table');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'w1', kind: 'agency' as const, status: 'new', contactName: 'Ana', email: 'ana@cool.co', orgName: 'Cool Air', location: null, verticalId: null, verticalOther: null,
  clientCountBand: '6-15', emailConfirmed: true, createdAt: '2026-10-05T12:00:00.000Z', sample: null, ...over,
});
const rows = [
  row(),
  row({ id: 'w2', orgName: 'Unconfirmed Co', emailConfirmed: false }),
  row({ id: 'w3', orgName: 'Invited Co', status: 'invited' }),
];
const show = (canWrite = true, tab: 'agencies' | 'businesses' = 'agencies', r = rows) =>
  render(<WaitlistTable rows={r} tab={tab} tz="UTC" verticals={{}} canWrite={canWrite} />);
afterEach(cleanup);

describe('WaitlistTable invites', () => {
  it('bulk bar only for confirmed new rows', () => {
    show();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByRole('checkbox', { name: 'Select Unconfirmed Co' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select Invited Co' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Cool Air' }));
    const bar = screen.getByRole('toolbar', { name: 'Selected agencies' });
    expect(bar.textContent).toContain('1 selected');
    expect(screen.getByLabelText('Pilot ends')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send pilot invite' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send trial invite' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Cool Air' }));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('viewers get no checkboxes and no Decline; Decline shows on new rows only', () => {
    show(false);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
    cleanup();
    show(true);
    expect(screen.getAllByRole('button', { name: 'Decline' })).toHaveLength(2); // Cool Air and Unconfirmed Co (both status new)
  });
});
