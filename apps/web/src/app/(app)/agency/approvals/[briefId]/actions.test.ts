import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), revalidatePath: vi.fn(), ctx: { role: 'account_manager' } as unknown }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: {}, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => m.revalidatePath(p) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
const { approveAction } = await import('./actions');

const B = '00000000-0000-4000-8000-0000000000b1';
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
beforeEach(() => {
  m.runTool.mockReset();
  m.revalidatePath.mockReset();
});

describe('approveAction', () => {
  it('weekly brief: goes out Monday at 7:00 AM in the client zone, as the button says', async () => {
    m.runTool.mockImplementation(async (_c: unknown, name: string) =>
      name === 'get_brief_review' ? { ok: true, data: { clientTimezone: 'America/Chicago' } } : { ok: true, data: { recommendations: 2 } });
    expect(await approveAction({ ok: true }, form({ briefId: B }))).toEqual({ ok: true, message: 'Approved — it goes out Monday 7:00 AM CT. 2 recommendation(s) created.' });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'get_brief_review', { briefId: B });
  });

  it('weekly brief: without the review read the message still names the time', async () => {
    m.runTool.mockImplementation(async (_c: unknown, name: string) => (name === 'get_brief_review' ? { ok: false, error: 'x' } : { ok: true, data: { recommendations: 0 } }));
    expect(await approveAction({ ok: true }, form({ briefId: B }))).toEqual({ ok: true, message: 'Approved — it goes out Monday 7:00 AM. 0 recommendation(s) created.' });
  });

  it('starting point: sent to the client (Ruling 13)', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { recommendations: 1 } });
    expect(await approveAction({ ok: true }, form({ briefId: B, kind: 'starting_point' }))).toEqual({ ok: true, message: 'Approved — sent to the client. 1 recommendation(s) created.' });
  });

  it('a send failure after the approval committed still refreshes the page so it shows approved', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'The starting point was approved but not sent (boom); use "send now"' });
    expect(await approveAction({ ok: true }, form({ briefId: B, kind: 'starting_point' }))).toEqual({ ok: false, error: expect.stringMatching(/approved but not sent/) });
    expect(m.revalidatePath).toHaveBeenCalledWith(`/agency/approvals/${B}`);
  });
});
