import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ ctx: { userId: 'op' } }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const { updateSpendGuardSettingsAction } = await import('./actions');

const ok = { ok: true } as const;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
beforeEach(() => m.runTool.mockReset().mockResolvedValue({ ok: true, data: {} }));

describe('updateSpendGuardSettingsAction', () => {
  it('passes only the submitted keys as numbers', async () => {
    expect(await updateSpendGuardSettingsAction(ok, form({ clientMonthlyLimitUsd: '20', spikeSnoozeHours: '12' }))).toMatchObject({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'update_spend_guard_settings', { clientMonthlyLimitUsd: 20, spikeSnoozeHours: 12 });
  });
  it('refuses an empty patch, a non-number and unknown keys without calling the tool', async () => {
    expect(await updateSpendGuardSettingsAction(ok, form({}))).toMatchObject({ ok: false });
    expect(await updateSpendGuardSettingsAction(ok, form({ spikeSnoozeHours: 'abc' }))).toMatchObject({ ok: false });
    expect(await updateSpendGuardSettingsAction(ok, form({ bogus: '1' }))).toMatchObject({ ok: false });
    expect(m.runTool).not.toHaveBeenCalled();
  });
});
