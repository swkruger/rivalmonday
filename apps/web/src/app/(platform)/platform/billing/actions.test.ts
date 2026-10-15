import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ ctx: { userId: 'op' } }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const { createPlanVersionAction, createDiscountCodeAction, createInviteLinkAction } = await import('./actions');

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const ok = { ok: true } as const;
beforeEach(() => m.runTool.mockReset().mockResolvedValue({ ok: true, data: { version: 3, url: 'https://x/join/t' } }));

describe('createPlanVersionAction', () => {
  const fields = { name: 'Standard', basePrice: '299', includedSeats: '3', seatPrice: '49.50', trialDays: '30' };
  it('turns dollars into cents', async () => {
    expect(await createPlanVersionAction(ok, form(fields))).toMatchObject({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'create_plan_version', { name: 'Standard', basePriceCents: 29900, includedSeats: 3, seatPriceCents: 4950, trialDays: 30 });
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
