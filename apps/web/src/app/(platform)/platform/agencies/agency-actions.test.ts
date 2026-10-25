import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => m.revalidate(...a) }));
const { unarchiveFromListAction } = await import('./agency-actions');

const AG = '22222222-2222-4222-8222-222222222222';
const form = () => { const fd = new FormData(); fd.set('agencyId', AG); return fd; };

beforeEach(() => { m.runTool.mockReset(); m.revalidate.mockReset(); });

describe('unarchiveFromListAction', () => {
  it('runs platform_unarchive_agency and revalidates the list', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { ok: true } });
    expect(await unarchiveFromListAction({ ok: true }, form())).toEqual({ ok: true, message: 'Agency unarchived.' });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'platform_unarchive_agency', { agencyId: AG });
    expect(m.revalidate).toHaveBeenCalledWith('/platform/agencies');
  });

  it('passes a refusal through without revalidating', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    expect(await unarchiveFromListAction({ ok: true }, form())).toEqual({ ok: false, error: 'Not found' });
    expect(m.revalidate).not.toHaveBeenCalled();
  });
});
