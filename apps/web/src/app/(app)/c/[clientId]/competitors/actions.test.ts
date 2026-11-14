import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), revalidatePath: vi.fn(), ctx: { role: 'agency_admin' } as { role: string } }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: {}, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => m.revalidatePath(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
const { confirmSocialAction, findSocialAction } = await import('./actions');

const C = '11111111-1111-4111-8111-111111111111';
const X = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333';
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const INITIAL = { ok: true } as const;

beforeEach(() => { m.runTool.mockReset(); m.revalidatePath.mockReset(); m.ctx = { role: 'agency_admin' }; });

describe('social account actions (18e)', () => {
  it('confirms a suggested account by id through confirm_social_account and revalidates the page', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { accountId: A, status: 'confirmed' } });
    const r = await confirmSocialAction(INITIAL, form({ clientId: C, competitorId: X, accountId: A, decision: 'confirm' }));
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining('confirmed') });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'confirm_social_account', { competitorId: X, decision: 'confirm', accountId: A });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/c/${C}/competitors/${X}`);
  });

  it('"Not them" rejects; a pasted link is sent as url only', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { accountId: A, status: 'rejected' } });
    expect(await confirmSocialAction(INITIAL, form({ clientId: C, competitorId: X, accountId: A, decision: 'reject' }))).toEqual({ ok: true, message: 'Marked as not them.' });
    expect(m.runTool).toHaveBeenLastCalledWith(m.ctx, 'confirm_social_account', { competitorId: X, decision: 'reject', accountId: A });
    await confirmSocialAction(INITIAL, form({ clientId: C, competitorId: X, url: 'facebook.com/smith', decision: 'confirm' }));
    expect(m.runTool).toHaveBeenLastCalledWith(m.ctx, 'confirm_social_account', { competitorId: X, decision: 'confirm', url: 'facebook.com/smith' });
  });

  it('surfaces the tools messages (bad link, rate limit) and does not revalidate on a refusal', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'That link is not a Facebook page or Instagram profile.' });
    expect(await confirmSocialAction(INITIAL, form({ clientId: C, competitorId: X, url: 'example.com', decision: 'confirm' }))).toEqual({ ok: false, error: 'That link is not a Facebook page or Instagram profile.' });
    m.runTool.mockResolvedValue({ ok: false, error: 'Accounts were searched for this business in the last 7 days.' });
    expect(await findSocialAction(INITIAL, form({ clientId: C, competitorId: X }))).toEqual({ ok: false, error: 'Accounts were searched for this business in the last 7 days.' });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it('find_social_accounts queues the search', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { queued: true } });
    expect(await findSocialAction(INITIAL, form({ clientId: C, competitorId: X }))).toMatchObject({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'find_social_accounts', { competitorId: X });
  });

  it('client roles 404 before any tool call', async () => {
    m.ctx = { role: 'client_owner' };
    await expect(confirmSocialAction(INITIAL, form({ clientId: C, competitorId: X, accountId: A }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(findSocialAction(INITIAL, form({ clientId: C, competitorId: X }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.runTool).not.toHaveBeenCalled();
  });
});
