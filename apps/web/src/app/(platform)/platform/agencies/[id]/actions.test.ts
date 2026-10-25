import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('@/server/support-email', () => ({ sendSupportSessionStartedEmail: async () => {} }));
vi.mock('@/server/support-cookie', () => ({ SUPPORT_COOKIE: 'rm_support', signSupportCookie: (id: string) => id }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: () => {} }), headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('NEXT_REDIRECT'); } }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => m.revalidate(...a) }));
const a = await import('./actions');

const AG = '22222222-2222-4222-8222-222222222222';
const MID = '44444444-4444-4444-8444-444444444444';
const INV = '55555555-5555-4555-8555-555555555555';
const form = (o: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ agencyId: AG, ...o })) fd.set(k, v);
  return fd;
};
const ok = { ok: true } as const;
const CTX = { userId: 'op' };

beforeEach(() => {
  m.runTool.mockReset();
  m.revalidate.mockReset();
});

describe('agency management actions call the right tool', () => {
  const cases: [string, (p: typeof ok, fd: FormData) => Promise<unknown>, Record<string, string>, string, Record<string, unknown>][] = [
    ['rename', a.renameAgencyAction, { name: ' Brightline ' }, 'platform_rename_agency', { agencyId: AG, name: 'Brightline' }],
    ['change role', a.changeMemberRoleAction, { membershipId: MID, role: 'account_manager' }, 'platform_change_member_role', { agencyId: AG, membershipId: MID, role: 'account_manager' }],
    ['remove', a.removeMemberAction, { membershipId: MID }, 'platform_remove_member', { agencyId: AG, membershipId: MID }],
    ['invite', a.inviteAgencyAdminAction, { email: 'maria@brightline.co' }, 'platform_invite_agency_admin', { agencyId: AG, email: 'maria@brightline.co' }],
    ['resend', a.resendInvitationAction, { invitationId: INV }, 'platform_resend_invitation', { agencyId: AG, invitationId: INV }],
    ['revoke', a.revokeInvitationAction, { invitationId: INV }, 'platform_revoke_invitation', { agencyId: AG, invitationId: INV }],
    ['hold', a.suspendAgencyAction, { reason: 'Card declined' }, 'platform_suspend_agency', { agencyId: AG, reason: 'Card declined' }],
    ['lift', a.unsuspendAgencyAction, {}, 'platform_unsuspend_agency', { agencyId: AG }],
    ['retry', a.retryHoldBillingAction, {}, 'platform_retry_hold_billing', { agencyId: AG }],
    ['archive', a.archiveAgencyAction, {}, 'platform_archive_agency', { agencyId: AG }],
    ['unarchive', a.unarchiveAgencyAction, {}, 'platform_unarchive_agency', { agencyId: AG }],
  ];
  it.each(cases)('%s → runTool + revalidate on success', async (_n, action, fields, tool, input) => {
    m.runTool.mockResolvedValue({ ok: true, data: { done: 0, failed: [], emailsSent: 0, billing: { done: 0, failed: [] }, emailSent: true, name: 'x', archivedAt: 'x', ok: true } });
    const r = await action(ok, form(fields));
    expect(m.runTool).toHaveBeenCalledWith(CTX, tool, input);
    expect(r).toMatchObject({ ok: true });
    expect(m.revalidate).toHaveBeenCalledWith(`/platform/agencies/${AG}`);
  });
  it.each(cases)('%s → passes the user-facing refusal back and does not revalidate', async (_n, action, fields) => {
    m.runTool.mockResolvedValue({ ok: false, error: 'An agency needs at least one admin.' });
    expect(await action(ok, form(fields))).toEqual({ ok: false, error: 'An agency needs at least one admin.' });
    expect(m.revalidate).not.toHaveBeenCalled();
  });
});

describe('result messages', () => {
  it('hold reports paused subscriptions, emails and failures', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { suspendedAt: 'x', billing: { done: 3, failed: [{ kind: 'client', clientName: 'Smile Dental' }] }, emailsSent: 2 } });
    expect(await a.suspendAgencyAction(ok, form({ reason: 'Card declined' }))).toEqual({
      ok: true, message: 'On hold. Billing paused for 3 subscriptions; 2 admins emailed. 1 could not be paused.',
    });
    m.runTool.mockResolvedValue({ ok: true, data: { suspendedAt: 'x', billing: { done: 1, failed: [] }, emailsSent: 1 } });
    expect(await a.suspendAgencyAction(ok, form({ reason: 'Card declined' }))).toEqual({ ok: true, message: 'On hold. Billing paused for 1 subscription; 1 admin emailed.' });
  });
  it('a rate-limited resend shows the tool message', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'This invite was already resent 3 times today.' });
    expect(await a.resendInvitationAction(ok, form({ invitationId: INV }))).toEqual({ ok: false, error: 'This invite was already resent 3 times today.' });
  });
  it('a hold reason shorter than 3 characters is refused before the tool', async () => {
    expect(await a.suspendAgencyAction(ok, form({ reason: ' a ' }))).toMatchObject({ ok: false });
    expect(m.runTool).not.toHaveBeenCalled();
  });
  it('an invite whose email could not be sent says so', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { invitationId: INV, expiresAt: 'x', emailSent: false } });
    expect(await a.inviteAgencyAdminAction(ok, form({ email: 'maria@brightline.co' }))).toEqual({ ok: true, message: "Invite created, but the email couldn't be sent. Resend it from Pending invites." });
  });
});
