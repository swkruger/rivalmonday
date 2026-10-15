import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ ctx: { userId: 'op' } }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const { extendTrialAction, grantPilotAction, attachDiscountAction, setSeatCapExemptAction } = await import('./billing-actions');

const AG = '22222222-2222-4222-8222-222222222222';
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ agencyId: AG, ...o })) fd.set(k, v);
  return fd;
};
const ok = { ok: true } as const;
beforeEach(() => m.runTool.mockReset().mockResolvedValue({ ok: true, data: { appliesAtCheckout: true, meaningful: true } }));

describe('agency billing actions', () => {
  it('extend trial sends end-of-day ISO and rejects an impossible date', async () => {
    expect(await extendTrialAction(ok, form({ until: '2026-11-30' }))).toMatchObject({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'extend_trial', { agencyId: AG, until: '2026-11-30T23:59:59.000Z' });
    expect(await extendTrialAction(ok, form({ until: '2026-02-31' }))).toMatchObject({ ok: false });
    expect(m.runTool).toHaveBeenCalledTimes(1);
  });
  it('grant pilot without a date omits endsAt', async () => {
    await grantPilotAction(ok, form({}));
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'grant_pilot', { agencyId: AG });
  });
  it('attach discount needs a code and passes refusals back', async () => {
    expect(await attachDiscountAction(ok, form({}))).toMatchObject({ ok: false });
    m.runTool.mockResolvedValue({ ok: false, error: 'That discount code is revoked or expired' });
    expect(await attachDiscountAction(ok, form({ discountCodeId: 'd1' }))).toEqual({ ok: false, error: 'That discount code is revoked or expired' });
  });
  it('seat cap toggle sends a boolean', async () => {
    await setSeatCapExemptAction(ok, form({ exempt: 'true' }));
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'set_seat_cap_exempt', { agencyId: AG, exempt: true });
  });
});
