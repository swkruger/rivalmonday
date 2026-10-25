// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';

const m = vi.hoisted(() => ({ resend: vi.fn(), revoke: vi.fn(), remove: vi.fn() }));
vi.mock('./actions', () => ({
  inviteAction: vi.fn(),
  resendInvitationAction: (...a: unknown[]) => m.resend(...a),
  revokeInvitationAction: (...a: unknown[]) => m.revoke(...a),
  revokeMembershipAction: (...a: unknown[]) => m.remove(...a),
}));
const { InvitationTable, InviteForm, RemoveMemberButton } = await import('./invite-form');

const A = { id: 'i1', email: 'new@acme.com', roleLabel: 'Agency admin', clientLabel: 'All clients', dates: 'Sent Oct 21 · expires Nov 4' };
const B = { id: 'i2', email: 'o@smith.co', roleLabel: 'Client owner', clientLabel: 'Smith HVAC', dates: 'Sent Oct 22 · expires Nov 5' };
beforeEach(() => { m.resend.mockReset(); m.revoke.mockReset(); m.remove.mockReset(); });

describe('InvitationTable (15c-2a T11)', () => {
  it('shows the sent and expiry dates and per-row labelled buttons', () => {
    render(<InvitationTable invitations={[A, B]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Sent Oct 21 · expires Nov 4')).toBeTruthy();
    expect(within(rows[0]!).getByText('Agency admin')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resend invite to new@acme.com' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revoke invite to o@smith.co' })).toBeTruthy();
  });

  it('resend result survives revalidate', async () => {
    m.resend.mockResolvedValue({ ok: true, message: 'Invite sent again.' });
    const { rerender } = render(<InvitationTable invitations={[A, B]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend invite to new@acme.com' }));
    });
    expect(m.resend).toHaveBeenCalledWith({ id: 'i1' });
    // revalidatePath hands the table fresh rows (new dates); the line stays under its own row.
    rerender(<InvitationTable invitations={[{ ...A, dates: 'Sent Oct 23 · expires Nov 6' }, B]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByRole('status').textContent).toBe('Invite sent again.');
    expect(within(rows[1]!).queryByRole('status')).toBeNull();
  });

  it('shows a refused resend (rate limit) as an error line', async () => {
    m.resend.mockResolvedValue({ ok: false, error: 'You can resend this invite again tomorrow.' });
    render(<InvitationTable invitations={[A]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend invite to new@acme.com' }));
    });
    expect((await screen.findByRole('alert')).textContent).toBe('You can resend this invite again tomorrow.');
  });

  it('asks before revoking', async () => {
    m.revoke.mockResolvedValue({ ok: true });
    render(<InvitationTable invitations={[A]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke invite to new@acme.com' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Revoke the invitation to new@acme.com?')).toBeTruthy();
    expect(m.revoke).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    });
    expect((m.revoke.mock.calls[0]![1] as FormData).get('invitationId')).toBe('i1');
  });

  it('hides Resend and Revoke in a read-only support session', () => {
    render(<ReadOnlyProvider readOnly><InvitationTable invitations={[A]} /></ReadOnlyProvider>);
    expect(screen.queryByRole('button', { name: /Resend|Revoke/ })).toBeNull();
    expect(screen.getByText('new@acme.com')).toBeTruthy();
  });
});

describe('RemoveMemberButton', () => {
  it('asks before removing and shows a refusal', async () => {
    m.remove.mockResolvedValue({ ok: false, error: 'An agency needs at least one admin.' });
    render(<RemoveMemberButton membershipId="m1" name="John" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove John' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Remove John?')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    });
    expect((m.remove.mock.calls[0]![1] as FormData).get('membershipId')).toBe('m1');
    expect((await screen.findByRole('alert')).textContent).toBe('An agency needs at least one admin.');
  });
});

describe('InviteForm', () => {
  it('words roles with the shared labels', () => {
    render(<InviteForm clients={[]} canInviteAgencyRoles />);
    expect(screen.getByRole('option', { name: 'Agency admin' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Account manager' })).toBeTruthy();
  });
});
