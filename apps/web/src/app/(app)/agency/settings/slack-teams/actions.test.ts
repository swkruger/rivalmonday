import { READ_ONLY_SESSION_MESSAGE } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), ctx: null as unknown }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: {}, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
const { toggleWebhookAction } = await import('./actions');

const ID = '44444444-4444-4444-8444-444444444444';
beforeEach(() => m.runTool.mockReset());

describe('toggleWebhookAction', () => {
  it('returns the g10 copy for a support-session refusal instead of throwing or silently succeeding', async () => {
    m.ctx = { role: 'agency_admin', support: { sessionId: 's', platformUserId: 'op' } };
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    await expect(toggleWebhookAction({ id: ID, active: false })).resolves.toEqual({ ok: false, error: READ_ONLY_SESSION_MESSAGE });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'set_webhook_active', { webhookId: ID, active: false });
  });

  it('still swallows ordinary refusals outside a session', async () => {
    m.ctx = { role: 'agency_admin' };
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    await expect(toggleWebhookAction({ id: ID, active: true })).resolves.toEqual({ ok: true });
  });
});
