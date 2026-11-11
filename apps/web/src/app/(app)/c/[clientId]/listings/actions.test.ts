import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), revalidatePath: vi.fn(), ctx: { role: 'agency_admin' } as { role: string } }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: {}, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'America/Chicago' }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => m.revalidatePath(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
const { requestListingsCheck } = await import('./actions');

const C = '11111111-1111-4111-8111-111111111111';
const answer = (data: object) => m.runTool.mockResolvedValue({ ok: true, data });

beforeEach(() => { m.runTool.mockReset(); m.revalidatePath.mockReset(); m.ctx = { role: 'agency_admin' }; });

describe('requestListingsCheck', () => {
  it('queues a check and revalidates the page', async () => {
    answer({ runId: 'r1' });
    await expect(requestListingsCheck(C)).resolves.toEqual({ ok: true, message: 'Check started. Results appear here in a few minutes.' });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'request_citation_audit', { clientId: C });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/c/${C}/listings`);
  });

  it('actions map refusals to decided copy', async () => {
    answer({ refused: 'weekly_limit', nextAvailableAt: '2026-11-17T18:00:00.000Z' });
    await expect(requestListingsCheck(C)).resolves.toEqual({ ok: false, error: 'Next check available Tue 17 Nov.' });
    answer({ refused: 'agency_daily_limit' });
    await expect(requestListingsCheck(C)).resolves.toEqual({ ok: false, error: "Your agency has used today's 10 manual listing checks." });
    answer({ refused: 'running' });
    await expect(requestListingsCheck(C)).resolves.toEqual({ ok: false, error: 'A listings check is already running for this client.' });
    answer({ refused: 'not_ready' });
    expect(await requestListingsCheck(C)).toMatchObject({ ok: false, error: expect.stringContaining('before checking') });
    answer({ refused: 'spend_paused' });
    expect(await requestListingsCheck(C)).toMatchObject({ ok: false, error: expect.stringContaining('paused') });
  });

  it('passes a tool error through and 404s client roles before any tool call', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    await expect(requestListingsCheck(C)).resolves.toEqual({ ok: false, error: 'Not found' });
    m.runTool.mockReset();
    m.ctx = { role: 'client_owner' };
    await expect(requestListingsCheck(C)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.runTool).not.toHaveBeenCalled();
  });
});
