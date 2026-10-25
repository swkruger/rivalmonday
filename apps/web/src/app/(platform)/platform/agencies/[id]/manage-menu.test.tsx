// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rename: vi.fn(), hold: vi.fn(), lift: vi.fn(), archive: vi.fn(), unarchive: vi.fn(), move: vi.fn() }));
vi.mock('./actions', () => ({
  renameAgencyAction: (...a: unknown[]) => m.rename(...a),
  suspendAgencyAction: (...a: unknown[]) => m.hold(...a),
  unsuspendAgencyAction: (...a: unknown[]) => m.lift(...a),
  archiveAgencyAction: (...a: unknown[]) => m.archive(...a),
  unarchiveAgencyAction: (...a: unknown[]) => m.unarchive(...a),
  moveAgencyToCurrentPlanAction: (...a: unknown[]) => m.move(...a),
}));
const { ManageMenu, UnarchiveButton } = await import('./manage-menu');

const AG = '22222222-2222-4222-8222-222222222222';
const agency = { id: AG, name: 'Brightline Marketing' };
const open = () => fireEvent.keyDown(screen.getByRole('button', { name: 'Manage' }), { key: 'Enter' });
const item = (name: string) => screen.findByRole('menuitem', { name });

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset().mockResolvedValue({ ok: true, message: 'Done.' });
});
afterEach(cleanup);

describe('ManageMenu items by role', () => {
  it('staff: Rename and Put on hold, no Archive, no Change plan', async () => {
    render(<ManageMenu agency={agency} role="staff" held={false} archiveRefusal={null} />);
    open();
    expect(await item('Rename agency')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Put on hold' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Archive/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Change plan/ })).toBeNull();
  });
  it('owner also gets Archive agency; a held agency offers Lift hold', async () => {
    render(<ManageMenu agency={agency} role="owner" held archiveRefusal={null} />);
    open();
    expect(await item('Archive agency')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Lift hold' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Put on hold' })).toBeNull();
  });
});

const planMove = {
  currentVersion: 3,
  row: { agencyId: AG, name: 'Brightline Marketing', state: 'active', version: 1, onHold: false, seatWarning: 'extra_seats' as const, extraSeatsAfter: 1, monthlyNowCents: 29900, monthlyAfterCents: 34900 },
};

describe('ManageMenu: Move to current plan', () => {
  it.each([
    ['owner, behind', 'owner', planMove, true],
    ['owner, current (no move)', 'owner', null, false],
    ['staff, behind', 'staff', planMove, false],
  ] as const)('%s -> item shown: %s', async (_n, role, move, shown) => {
    render(<ManageMenu agency={agency} role={role} held={false} archiveRefusal={null} planMove={move} />);
    open();
    await item('Rename agency');
    expect(screen.queryByRole('menuitem', { name: 'Move to current plan' }) !== null).toBe(shown);
  });

  it('the dialog shows now to after and the warning, and confirming posts the agency id', async () => {
    m.move.mockResolvedValue({ ok: true, data: { targetPlanId: 'p3', targetVersion: 3, results: [{ agencyId: AG, outcome: 'moved', emailed: true }] } });
    render(<ManageMenu agency={agency} role="owner" held={false} archiveRefusal={null} planMove={planMove} />);
    open();
    fireEvent.click(await item('Move to current plan'));
    const dialog = await screen.findByRole('dialog', { name: 'Move Brightline Marketing to v3?' });
    expect(dialog.textContent).toContain('$299 → $349');
    expect(dialog.textContent).toContain('Pays for 1 extra seat from the next billing date.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to v3' }));
    await waitFor(() => expect(m.move).toHaveBeenCalledWith(AG));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toBe('Moved 1.');
  });

  it('a refused move stays in the dialog with the reason', async () => {
    m.move.mockResolvedValue({ ok: true, data: { targetPlanId: 'p3', targetVersion: 3, results: [{ agencyId: AG, outcome: 'refused', reason: 'on_hold', emailed: false }] } });
    render(<ManageMenu agency={agency} role="owner" held={false} archiveRefusal={null} planMove={planMove} />);
    open();
    fireEvent.click(await item('Move to current plan'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to v3' }));
    expect(await within(dialog).findByText('Moved 0. 1 not moved: Brightline Marketing (On hold)')).toBeTruthy();
  });
});

describe('ManageMenu dialogs', () => {
  it('rename posts the new name', async () => {
    render(<ManageMenu agency={agency} role="staff" held={false} archiveRefusal={null} />);
    open();
    fireEvent.click(await item('Rename agency'));
    const dialog = await screen.findByRole('dialog', { name: 'Rename agency' });
    const input = within(dialog).getByLabelText('Agency name') as HTMLInputElement;
    expect(input.value).toBe('Brightline Marketing');
    fireEvent.change(input, { target: { value: 'Brightline Co' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(m.rename).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(m.rename.mock.calls[0]![1] as FormData)).toEqual({ agencyId: AG, name: 'Brightline Co' });
  });

  it('put on hold: mockup copy, reason label and hint, needs 3 characters, shows the result line', async () => {
    m.hold.mockResolvedValue({ ok: true, message: 'On hold. Billing paused for 4 subscriptions; 2 admins emailed.' });
    render(<ManageMenu agency={agency} role="staff" held={false} archiveRefusal={null} />);
    open();
    fireEvent.click(await item('Put on hold'));
    const dialog = await screen.findByRole('dialog', { name: 'Put Brightline Marketing on hold?' });
    const text = dialog.textContent ?? '';
    expect(text).toContain('While on hold:');
    expect(text).toContain("Its team can sign in and see everything, but can't change anything.");
    expect(text).toContain('Scheduled work stops: no collection, briefs or alerts.');
    expect(text).toContain("Billing pauses on its plan and on its clients' subscriptions. Invoices during the hold aren't charged later.");
    expect(text).toContain('Its agency admins get an email saying the account is on hold.');
    expect(text).toContain('Never shown to the agency. 3–500 characters.');
    const submit = within(dialog).getByRole('button', { name: 'Put on hold' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Reason (staff only)'), { target: { value: 'Card declined three times' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(m.hold).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(m.hold.mock.calls[0]![1] as FormData)).toEqual({ agencyId: AG, reason: 'Card declined three times' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toBe('On hold. Billing paused for 4 subscriptions; 2 admins emailed.');
  });

  it('lift hold confirms with the spec copy', async () => {
    render(<ManageMenu agency={agency} role="staff" held archiveRefusal={null} />);
    open();
    fireEvent.click(await item('Lift hold'));
    const dialog = await screen.findByRole('dialog', { name: 'Lift the hold on Brightline Marketing?' });
    expect(dialog.textContent).toContain('Changes, scheduled work and billing resume now, and its admins get an email.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lift hold' }));
    await waitFor(() => expect(m.lift).toHaveBeenCalledTimes(1));
  });

  it('archive with live billing shows only the refusal and Close', async () => {
    render(<ManageMenu agency={agency} role="owner" held={false} archiveRefusal="This agency still has active billing. Cancel it in Stripe first, then archive. Its plan is still active." />);
    open();
    fireEvent.click(await item('Archive agency'));
    const dialog = await screen.findByRole('dialog', { name: 'Archive Brightline Marketing?' });
    expect(dialog.textContent).toContain('Cancel it in Stripe first, then archive. Its plan is still active.');
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Archive agency' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('archive without live billing needs the agency name typed', async () => {
    render(<ManageMenu agency={agency} role="owner" held={false} archiveRefusal={null} />);
    open();
    fireEvent.click(await item('Archive agency'));
    const dialog = await screen.findByRole('dialog', { name: 'Archive Brightline Marketing?' });
    expect(dialog.textContent).toContain('The agency, its team and its clients disappear for everyone outside the platform. Nothing is deleted: evidence stays, and an owner can unarchive it from the Archived filter. After 30 days it can be purged.');
    const confirm = within(dialog).getByRole('button', { name: 'Archive agency' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Type Brightline Marketing to confirm'), { target: { value: 'Brightline Marketing' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(m.archive).toHaveBeenCalledTimes(1));
  });
});

describe('UnarchiveButton', () => {
  it('confirms with the spec copy and posts', async () => {
    render(<UnarchiveButton agency={agency} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unarchive Brightline Marketing?' });
    expect(dialog.textContent).toContain("The agency and its clients come back as they were. Paused billing doesn't restart on its own.");
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unarchive' }));
    await waitFor(() => expect(m.unarchive).toHaveBeenCalledTimes(1));
  });
});
