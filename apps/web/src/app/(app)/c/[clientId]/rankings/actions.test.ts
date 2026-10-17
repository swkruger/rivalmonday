import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), revalidatePath: vi.fn(), ctx: { role: 'agency_admin' } as { role: string } }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: {}, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => m.revalidatePath(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
const { requestRankScan, saveRankSettings } = await import('./actions');

const C = '11111111-1111-4111-8111-111111111111';
const settings = (state: string, label: string | null, nextAvailableAt: string | null = null) => ({
  ok: true, data: { keywords: ['ac repair'], allKeywords: ['ac repair'], gridSize: 7, radiusKm: 25, scan: { state, nextAvailableAt, label } },
});
/** request_rank_scan answers `refusal`, then the re-read of get_rank_settings answers `after`. */
const refuse = (refusal: object, after: unknown) => m.runTool.mockImplementation(async (_ctx: unknown, name: string) => (name === 'request_rank_scan' ? { ok: true, data: { queued: false, ...refusal } } : after));

beforeEach(() => {
  m.runTool.mockReset();
  m.revalidatePath.mockReset();
  m.ctx = { role: 'agency_admin' };
});

describe('requestRankScan', () => {
  it('queues a scan and says when results arrive', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { queued: true, scanEtaMinutes: 4 } });
    await expect(requestRankScan(C)).resolves.toEqual({ ok: true, message: 'Scan queued — results in about 4 minutes.' });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'request_rank_scan', { clientId: C });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/c/${C}/rankings`);
  });

  it('actions map refusals to decided copy', async () => {
    refuse({ reason: 'weekly_limit', nextAvailableAt: '2026-10-21T09:00:00.000Z' }, settings('weekly_limit', 'Next scan available Wed 21 Oct', '2026-10-21T09:00:00.000Z'));
    await expect(requestRankScan(C)).resolves.toEqual({ ok: false, error: 'Next manual scan available Wed 21 Oct.' });

    refuse({ reason: 'agency_daily_limit', nextAvailableAt: '2026-10-18T00:00:00.000Z' }, settings('agency_daily_limit', "Your agency has used today's 10 manual scans."));
    await expect(requestRankScan(C)).resolves.toEqual({ ok: false, error: "Your agency has used today's 10 manual scans." });

    const cap = "This scan would exceed Cool Air's monthly cost cap ($15). Raise the cap in Usage or wait until next month.";
    refuse({ reason: 'cap' }, settings('cap', cap));
    await expect(requestRankScan(C)).resolves.toEqual({ ok: false, error: cap });

    refuse({ reason: 'not_ready' }, settings('running', 'Scan running…'));
    await expect(requestRankScan(C)).resolves.toEqual({ ok: false, error: 'A rank scan is already running for this client.' });

    // Refusals re-render the page so the button shows its new state.
    expect(m.revalidatePath).toHaveBeenCalledWith(`/c/${C}/rankings`);
  });

  it('falls back to the refusal\'s own date when the settings re-read fails', async () => {
    refuse({ reason: 'weekly_limit', nextAvailableAt: '2026-10-21T09:00:00.000Z' }, { ok: false, error: 'Not found' });
    await expect(requestRankScan(C)).resolves.toEqual({ ok: false, error: 'Next manual scan available Wed 21 Oct.' });
    refuse({ reason: 'agency_daily_limit' }, { ok: false, error: 'Not found' });
    await expect(requestRankScan(C)).resolves.toEqual({ ok: false, error: "Your agency has used today's 10 manual scans." });
  });

  it('reports a scan that could not be queued instead of throwing', async () => {
    const { ToolError } = await import('@cs/core');
    const err = new ToolError('internal', 'Could not queue the rank scan');
    m.runTool.mockRejectedValue(err);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(requestRankScan(C)).resolves.toEqual({ ok: false, error: 'The scan could not be started. Try again in a few minutes.' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(C), err);
    log.mockRestore();
    m.runTool.mockRejectedValue(new Error('db down'));
    await expect(requestRankScan(C)).rejects.toThrow('db down');
  });

  it('passes a tool refusal through unchanged', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    await expect(requestRankScan(C)).resolves.toEqual({ ok: false, error: 'Not found' });
  });

  it('is a 404 for client roles', async () => {
    m.ctx = { role: 'client_owner' };
    await expect(requestRankScan(C)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.runTool).not.toHaveBeenCalled();
  });
});

describe('saveRankSettings', () => {
  it('saves through update_client_rank_settings and confirms', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { ok: true } });
    const input = { keywords: ['ac repair', 'furnace repair'], gridSize: 5 as const, radiusKm: 12 };
    await expect(saveRankSettings(C, input)).resolves.toEqual({ ok: true, message: 'Saved. The next scan uses these settings.' });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'update_client_rank_settings', { clientId: C, ...input });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/c/${C}/rankings`);
  });

  it('shows the tool\'s refusal message', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: "Pick keywords from the client's keyword list." });
    await expect(saveRankSettings(C, { keywords: ['x'], gridSize: 7, radiusKm: 10 })).resolves.toEqual({ ok: false, error: "Pick keywords from the client's keyword list." });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});
