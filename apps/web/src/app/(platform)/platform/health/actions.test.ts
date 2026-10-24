import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ ctx: { userId: 'op' } }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const { resetAiPauseAction } = await import('./actions');

const ok = { ok: true } as const;
const form = (note?: string) => {
  const fd = new FormData();
  if (note !== undefined) fd.set('note', note);
  return fd;
};
beforeEach(() => m.runTool.mockReset().mockResolvedValue({ ok: true, data: { state: 'ok' } }));

describe('resetAiPauseAction', () => {
  it('reset requires a note (blank and over 200 refused before the tool)', async () => {
    expect(await resetAiPauseAction(ok, form('   '))).toMatchObject({ ok: false });
    expect(await resetAiPauseAction(ok, form('x'.repeat(201)))).toMatchObject({ ok: false });
    expect(m.runTool).not.toHaveBeenCalled();
  });
  it('sends the trimmed note and passes refusals back', async () => {
    expect(await resetAiPauseAction(ok, form('  backfill  '))).toMatchObject({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'reset_ai_pause', { note: 'backfill' });
    m.runTool.mockResolvedValue({ ok: false, error: 'Nothing to reset' });
    expect(await resetAiPauseAction(ok, form('again'))).toEqual({ ok: false, error: 'Nothing to reset' });
  });
});
