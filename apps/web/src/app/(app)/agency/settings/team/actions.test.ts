import { READ_ONLY_SESSION_MESSAGE } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), ctx: null as unknown }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: {}, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.example' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
const { inviteAction, resendInvitationAction } = await import('./actions');

const ID = '44444444-4444-4444-8444-444444444444';
const CLIENT = '55555555-5555-4555-8555-555555555555';
beforeEach(() => m.runTool.mockReset());

function fd(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe('inviteAction (15c-2a T11)', () => {
  beforeEach(() => { m.ctx = { role: 'agency_admin' }; });

  it('says the invitation was sent when the email went out, for agency and client roles', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { invitationId: ID, expiresAt: '2026-11-06T00:00:00.000Z', emailSent: true } });
    expect(await inviteAction({ ok: true }, fd({ email: 'pat@acme.co', role: 'account_manager' }))).toEqual({ ok: true, message: 'Invitation sent to pat@acme.co.' });
    expect(await inviteAction({ ok: true }, fd({ email: 'o@smith.co', role: 'client_owner', clientId: CLIENT }))).toEqual({ ok: true, message: 'Invitation sent to o@smith.co.' });
  });

  it('says how to sign in when the email could not be sent', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { invitationId: ID, expiresAt: '2026-11-06T00:00:00.000Z', emailSent: false } });
    expect(await inviteAction({ ok: true }, fd({ email: 'pat@acme.co', role: 'agency_admin' }))).toEqual({
      ok: true, message: "Invitation created, but the email couldn't be sent. Ask them to sign in at https://app.example/sign-in with this email.",
    });
  });
});

describe('resendInvitationAction', () => {
  it('resends through the tool and confirms', async () => {
    m.ctx = { role: 'account_manager' };
    m.runTool.mockResolvedValue({ ok: true, data: { sentAt: 'x', expiresAt: 'y', emailSent: true } });
    expect(await resendInvitationAction({ id: ID })).toEqual({ ok: true, message: 'Invite sent again.' });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'resend_invitation', { invitationId: ID });
  });

  it('returns the refusal copy (rate limit) and the g10 copy in a support session', async () => {
    m.ctx = { role: 'agency_admin' };
    m.runTool.mockResolvedValue({ ok: false, error: 'You can resend this invite again tomorrow.' });
    expect(await resendInvitationAction({ id: ID })).toEqual({ ok: false, error: 'You can resend this invite again tomorrow.' });
    m.ctx = { role: 'agency_admin', support: { sessionId: 's', platformUserId: 'op' } };
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    expect(await resendInvitationAction({ id: ID })).toEqual({ ok: false, error: READ_ONLY_SESSION_MESSAGE });
  });

  it('says how to sign in when the resend email could not be sent', async () => {
    m.ctx = { role: 'agency_admin' };
    m.runTool.mockResolvedValue({ ok: true, data: { sentAt: 'x', expiresAt: 'y', emailSent: false } });
    expect(await resendInvitationAction({ id: ID })).toEqual({
      ok: true, message: "Invite renewed for 14 days, but the email couldn't be sent. Ask them to sign in at https://app.example/sign-in with this email.",
    });
  });

  it('404s for client roles', async () => {
    m.ctx = { role: 'client_owner' };
    await expect(resendInvitationAction({ id: ID })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.runTool).not.toHaveBeenCalled();
  });
});
