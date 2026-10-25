import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), email: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ ctx: { userId: 'op' } }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('@/server/invite-email', () => ({ sendAgencyInviteEmail: (...a: unknown[]) => m.email(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const { moveAgenciesToCurrentPlanAction, createPlanVersionAction, createDiscountCodeAction, createInviteLinkAction, setConnectFeeAction, setSignupsPausedAction } = await import('./actions');

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const ok = { ok: true } as const;
beforeEach(() => {
  m.email.mockReset().mockResolvedValue(undefined); // braces: a returned function would run as teardown
});
beforeEach(() => m.runTool.mockReset().mockResolvedValue({ ok: true, data: { version: 3, url: 'https://x/join/t' } }));

describe('createPlanVersionAction', () => {
  const fields = { name: 'Standard', basePrice: '299', includedSeats: '3', seatPrice: '49.50', trialDays: '30' };
  it('turns dollars into cents', async () => {
    expect(await createPlanVersionAction(ok, form(fields))).toMatchObject({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'create_plan_version', { name: 'Standard', basePriceCents: 29900, includedSeats: 3, seatPriceCents: 4950, trialDays: 30, features: [] });
  });
  it('sends the ticked Includes checkboxes as features', async () => {
    const fd = form(fields);
    fd.append('features', 'mcp');
    fd.append('features', 'ask');
    await createPlanVersionAction(ok, fd);
    expect(m.runTool.mock.calls[0]?.[2]).toMatchObject({ features: ['ask', 'mcp'] });
  });
  it('rejects bad money and integers before calling the tool', async () => {
    expect(await createPlanVersionAction(ok, form({ ...fields, basePrice: '1,000' }))).toMatchObject({ ok: false });
    expect(await createPlanVersionAction(ok, form({ ...fields, trialDays: '1e2' }))).toMatchObject({ ok: false });
    expect(m.runTool).not.toHaveBeenCalled();
  });
  it('passes a tool refusal back', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    expect(await createPlanVersionAction(ok, form(fields))).toEqual({ ok: false, error: 'Not found' });
  });
});

describe('createDiscountCodeAction', () => {
  const fields = { code: 'FRIEND', kind: 'percent', amount: '20', appliesTo: 'both', duration: 'once' };
  it('sends percentOff, or cents for a dollar discount', async () => {
    await createDiscountCodeAction(ok, form(fields));
    expect(m.runTool.mock.calls[0]?.[2]).toMatchObject({ code: 'FRIEND', percentOff: 20 });
    await createDiscountCodeAction(ok, form({ ...fields, kind: 'amount', amount: '25.5' }));
    expect(m.runTool.mock.calls[1]?.[2]).toMatchObject({ amountOffCents: 2550 });
  });
  it.each(['NaN', '1e2', '0x10', '-5'])('rejects percent %j', async (amount) => {
    expect(await createDiscountCodeAction(ok, form({ ...fields, amount }))).toMatchObject({ ok: false });
    expect(m.runTool).not.toHaveBeenCalled();
  });
  it('rejects a non-integer max uses', async () => {
    expect(await createDiscountCodeAction(ok, form({ ...fields, maxRedemptions: '1e2' }))).toMatchObject({ ok: false });
    expect(m.runTool).not.toHaveBeenCalled();
  });
  it('passes a tool refusal back', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'A discount code with that name already exists' });
    expect(await createDiscountCodeAction(ok, form(fields))).toMatchObject({ ok: false, error: expect.stringContaining('already exists') });
  });
});

describe('createInviteLinkAction', () => {
  it('requires a real pilot end date and returns the URL on success', async () => {
    expect(await createInviteLinkAction(ok, form({ offer: 'pilot', pilotEndsAt: '2026-02-31' }))).toMatchObject({ ok: false });
    expect(await createInviteLinkAction(ok, form({ offer: 'pilot', pilotEndsAt: '2026-12-01', maxUses: '3' }))).toEqual({ ok: true, url: 'https://x/join/t' });
    expect(m.runTool.mock.calls[0]?.[2]).toMatchObject({ offer: 'pilot', pilotEndsAt: '2026-12-01T23:59:59.000Z', maxUses: 3, expiresInDays: 14 });
  });
});

describe('createInviteLinkAction emailIt', () => {
  const fields = { offer: 'trial', emailLock: 'new@agency.test', emailIt: 'on' };
  it('emails the created link once to the locked address and passes emailIt to the tool', async () => {
    expect(await createInviteLinkAction(ok, form(fields))).toMatchObject({ ok: true, url: 'https://x/join/t' });
    expect(m.runTool.mock.calls[0]?.[2]).toMatchObject({ emailLock: 'new@agency.test', emailIt: true });
    expect(m.email).toHaveBeenCalledTimes(1);
    expect(m.email.mock.calls[0]?.[0]).toMatchObject({ to: 'new@agency.test', url: 'https://x/join/t', offer: 'trial' });
  });
  it('does not email without the checkbox', async () => {
    await createInviteLinkAction(ok, form({ offer: 'trial', emailLock: 'new@agency.test' }));
    expect(m.email).not.toHaveBeenCalled();
  });
  it('does not email when the tool refuses (e.g. emailIt without a lock)', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Set an email lock to email the link.' });
    expect(await createInviteLinkAction(ok, form({ offer: 'trial', emailIt: 'on' }))).toEqual({ ok: false, error: 'Set an email lock to email the link.' });
    expect(m.email).not.toHaveBeenCalled();
  });
  it('on a send failure still returns the link, with the decided message', async () => {
    m.email.mockRejectedValue(new Error('smtp down'));
    expect(await createInviteLinkAction(ok, form(fields))).toEqual({ ok: true, url: 'https://x/join/t', notice: 'Link created, but the email failed — copy the link below.' });
  });
});

describe('setSignupsPausedAction', () => {
  it('pauses and resumes through the owner tool', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { paused: true } });
    expect(await setSignupsPausedAction(ok, form({ paused: 'true' }))).toMatchObject({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'set_signups_paused', { paused: true });
    await setSignupsPausedAction(ok, form({ paused: 'false' }));
    expect(m.runTool.mock.calls[1]?.[2]).toEqual({ paused: false });
  });
  it('passes a refusal back', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Nope' });
    expect(await setSignupsPausedAction(ok, form({ paused: 'true' }))).toEqual({ ok: false, error: 'Nope' });
  });
});

describe('setConnectFeeAction', () => {
  it('global: sends only the percent', async () => {
    expect(await setConnectFeeAction(ok, form({ agencyId: '', percent: '2.5' }))).toMatchObject({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'set_connect_fee_percent', { percent: 2.5 });
  });
  it('per agency: sends agencyId; blank percent clears the override', async () => {
    await setConnectFeeAction(ok, form({ agencyId: 'ag-1', percent: '0' }));
    expect(m.runTool.mock.calls[0]?.[2]).toEqual({ agencyId: 'ag-1', percent: 0 });
    await setConnectFeeAction(ok, form({ agencyId: 'ag-1', percent: '' }));
    expect(m.runTool.mock.calls[1]?.[2]).toEqual({ agencyId: 'ag-1', percent: null });
  });
  it('rejects non-numeric text and a blank global percent before calling the tool', async () => {
    expect(await setConnectFeeAction(ok, form({ agencyId: '', percent: '1e1' }))).toMatchObject({ ok: false });
    expect(await setConnectFeeAction(ok, form({ agencyId: '', percent: '' }))).toMatchObject({ ok: false });
    expect(m.runTool).not.toHaveBeenCalled();
  });
  it('passes a tool refusal back', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Nope' });
    expect(await setConnectFeeAction(ok, form({ agencyId: '', percent: '3' }))).toEqual({ ok: false, error: 'Nope' });
  });
});

describe('moveAgenciesToCurrentPlanAction', () => {
  it('calls move_agencies_to_current_plan with the ids and returns the tool result', async () => {
    const data = { targetPlanId: 'p2', targetVersion: 2, results: [{ agencyId: 'a1', outcome: 'moved', emailed: true }] };
    m.runTool.mockResolvedValue({ ok: true, data });
    expect(await moveAgenciesToCurrentPlanAction(['a1', 'a2'])).toEqual({ ok: true, data });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'move_agencies_to_current_plan', { agencyIds: ['a1', 'a2'] });
  });
  it('passes a refusal back', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    expect(await moveAgenciesToCurrentPlanAction(['a1'])).toEqual({ ok: false, error: 'Not found' });
  });
});
