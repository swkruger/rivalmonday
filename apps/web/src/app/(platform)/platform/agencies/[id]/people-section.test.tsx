// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ change: vi.fn(), remove: vi.fn(), invite: vi.fn(), resend: vi.fn(), revoke: vi.fn() }));
vi.mock('./actions', () => ({
  changeMemberRoleAction: (...a: unknown[]) => m.change(...a),
  removeMemberAction: (...a: unknown[]) => m.remove(...a),
  inviteAgencyAdminAction: (...a: unknown[]) => m.invite(...a),
  resendInvitationAction: (...a: unknown[]) => m.resend(...a),
  revokeInvitationAction: (...a: unknown[]) => m.revoke(...a),
}));
const { PeopleSection } = await import('./people-section');

const AG = '22222222-2222-4222-8222-222222222222';
const people = {
  members: [
    { membershipId: 'm1', userId: 'u1', name: 'Dana Ortiz', email: 'dana@brightline.co', role: 'agency_admin', clients: [] },
    { membershipId: 'm2', userId: 'u2', name: 'Sam Patel', email: 'sam@brightline.co', role: 'agency_admin', clients: [] },
    { membershipId: 'm3', userId: 'u3', name: 'Jo Kim', email: 'jo@brightline.co', role: 'account_manager', clients: [{ id: 'c1', name: 'Cool Air HVAC' }, { id: 'c2', name: 'Smile Dental' }] },
    { membershipId: 'm4', userId: 'u4', name: 'Lee Grant', email: 'lee@coolairhvac.com', role: 'client_owner', clients: [{ id: 'c1', name: 'Cool Air HVAC' }] },
  ],
  invitations: [
    { invitationId: 'i1', email: 'maria@brightline.co', role: 'agency_admin', clientId: null, clientName: null, sentAt: '2026-10-23T12:00:00Z', expiresAt: '2026-10-30T12:00:00Z' },
  ],
};
const hrefs = { team: '?people=team', clients: '?people=clients', invites: '?people=invites' };
const props = (o: Record<string, unknown> = {}) => ({ agency: { id: AG, name: 'Brightline Marketing' }, people, tab: 'team' as const, hrefs, canManage: true, tz: 'UTC', nowMs: Date.parse('2026-10-25T12:00:00Z'), ...o });
const openMenu = (name: string) => fireEvent.keyDown(screen.getByRole('button', { name: `Actions for ${name}` }), { key: 'Enter' });

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset().mockResolvedValue({ ok: true, message: 'Done.' });
});
afterEach(cleanup);

describe('PeopleSection', () => {
  it('heading counts and three tabs with counts', () => {
    render(<PeopleSection {...props()} />);
    expect(screen.getByRole('heading', { name: /People/ }).textContent).toContain('2 agency admins · 1 account manager · 1 client owner · 1 pending invite');
    const tabs = screen.getByRole('navigation', { name: 'People views' });
    expect(within(tabs).getByRole('link', { name: /Agency team\s*3/ }).getAttribute('aria-current')).toBe('page');
    expect(within(tabs).getByRole('link', { name: /Client people\s*1/ }).getAttribute('href')).toBe('?people=clients');
    expect(within(tabs).getByRole('link', { name: /Pending invites\s*1/ })).toBeTruthy();
  });

  it('agency team rows: role labels, All clients, scoped client names', () => {
    render(<PeopleSection {...props()} />);
    expect(screen.getAllByText('Agency admin').length).toBe(2);
    expect(screen.getAllByText('All clients').length).toBe(2);
    expect(screen.getByText('Cool Air HVAC, Smile Dental')).toBeTruthy();
    expect(screen.queryByText('Lee Grant')).toBeNull();
  });

  it('an agency admin row offers Make account manager and Remove; an account manager row offers Make agency admin', async () => {
    render(<PeopleSection {...props()} />);
    openMenu('Dana Ortiz');
    expect(await screen.findByRole('menuitem', { name: 'Make account manager' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Remove from agency' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Make agency admin' })).toBeNull();
    cleanup();
    render(<PeopleSection {...props()} />);
    openMenu('Jo Kim');
    expect(await screen.findByRole('menuitem', { name: 'Make agency admin' })).toBeTruthy();
  });

  it('a client-person row has only Remove', async () => {
    render(<PeopleSection {...props({ tab: 'clients' })} />);
    expect(screen.getByText('Lee Grant')).toBeTruthy();
    openMenu('Lee Grant');
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Remove from agency']);
  });

  it('change role confirms with the mockup copy, then posts; a refusal stays inline in the dialog', async () => {
    m.change.mockResolvedValue({ ok: false, error: 'An agency needs at least one admin.' });
    render(<PeopleSection {...props()} />);
    openMenu('Dana Ortiz');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make account manager' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make Dana Ortiz an account manager?' });
    expect(dialog.textContent).toContain("Dana will still see every client but can't manage the team, billing or settings. The agency can limit their clients in Team settings.");
    expect(m.change).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change role' }));
    await waitFor(() => expect(m.change).toHaveBeenCalledTimes(1));
    const fd = m.change.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(fd)).toEqual({ agencyId: AG, membershipId: 'm1', role: 'account_manager' });
    expect((await within(dialog).findByRole('alert')).textContent).toContain('An agency needs at least one admin.');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Change role' })).toBeNull();
  });

  it('remove confirms with the agency name, and the result line survives the dialog closing', async () => {
    m.remove.mockResolvedValue({ ok: true, message: 'Jo Kim removed.' });
    render(<PeopleSection {...props()} />);
    openMenu('Jo Kim');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from agency' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Jo Kim from Brightline Marketing?' });
    expect(dialog.textContent).toContain('Jo loses access to the agency and its clients right away. Their past activity stays.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toBe('Jo Kim removed.');
  });

  it('invite agency admin: dialog copy, email field, posts', async () => {
    render(<PeopleSection {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Invite agency admin' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite an agency admin' });
    expect(dialog.textContent).toContain('They get an email from Brightline Marketing with a link to join as an agency admin.');
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'maria@brightline.co' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    await waitFor(() => expect(m.invite).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(m.invite.mock.calls[0]![1] as FormData)).toEqual({ agencyId: AG, email: 'maria@brightline.co' });
  });

  it('pending invites: dates, Resend and Revoke behind a confirm', async () => {
    render(<PeopleSection {...props({ tab: 'invites' })} />);
    expect(screen.getByText('maria@brightline.co')).toBeTruthy();
    expect(screen.getByText('Oct 23')).toBeTruthy();
    expect(screen.getByText('Oct 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resend invite to maria@brightline.co' }));
    expect(m.resend).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(m.resend).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(m.resend.mock.calls[0]![1] as FormData)).toEqual({ agencyId: AG, invitationId: 'i1' });
    expect(screen.getByRole('button', { name: 'Revoke invite to maria@brightline.co' })).toBeTruthy();
  });

  it('a viewer gets read-only tables: no invite button, no row actions', () => {
    render(<PeopleSection {...props({ canManage: false })} />);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    render(<PeopleSection {...props({ canManage: false, tab: 'invites' })} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
