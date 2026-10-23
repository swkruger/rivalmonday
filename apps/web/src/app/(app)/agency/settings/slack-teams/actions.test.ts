import { READ_ONLY_SESSION_MESSAGE } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), ctx: null as unknown }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: {}, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
const { deleteWebhookAction, testWebhookAction, toggleWebhookAction } = await import('./actions');

const ID = '44444444-4444-4444-8444-444444444444';
beforeEach(() => m.runTool.mockReset());

describe('toggleWebhookAction', () => {
  it('returns the g10 copy for a support-session refusal instead of throwing or silently succeeding', async () => {
    m.ctx = { role: 'agency_admin', support: { sessionId: 's', platformUserId: 'op' } };
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    await expect(toggleWebhookAction({ id: ID, active: false })).resolves.toEqual({ ok: false, error: READ_ONLY_SESSION_MESSAGE });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'set_webhook_active', { webhookId: ID, active: false });
  });

  it('returns an ordinary refusal so the switch can revert and say why', async () => {
    m.ctx = { role: 'agency_admin' };
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    await expect(toggleWebhookAction({ id: ID, active: true })).resolves.toEqual({ ok: false, error: 'Not found' });
    m.runTool.mockResolvedValue({ ok: true, data: { ok: true } });
    await expect(toggleWebhookAction({ id: ID, active: true })).resolves.toEqual({ ok: true });
  });

  it('404s for account managers', async () => {
    m.ctx = { role: 'account_manager' };
    await expect(toggleWebhookAction({ id: ID, active: true })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(testWebhookAction({ id: ID })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(deleteWebhookAction({ ok: true }, fd({ webhookId: ID }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.runTool).not.toHaveBeenCalled();
  });
});

function fd(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe('testWebhookAction', () => {
  it('returns the receiver outcome, or the refusal copy', async () => {
    m.ctx = { role: 'agency_admin' };
    m.runTool.mockResolvedValue({ ok: true, data: { ok: false, error: 'timeout' } });
    await expect(testWebhookAction({ id: ID })).resolves.toEqual({ ok: true, result: { ok: false, error: 'timeout' } });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'test_webhook', { webhookId: ID });
    m.runTool.mockResolvedValue({ ok: false, error: 'You can send another test in a few minutes.' });
    await expect(testWebhookAction({ id: ID })).resolves.toEqual({ ok: false, error: 'You can send another test in a few minutes.' });
  });

  it('gives the g10 copy inside a support session', async () => {
    m.ctx = { role: 'agency_admin', support: { sessionId: 's', platformUserId: 'op' } };
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    await expect(testWebhookAction({ id: ID })).resolves.toEqual({ ok: false, error: READ_ONLY_SESSION_MESSAGE });
  });
});

describe('deleteWebhookAction', () => {
  it('deletes through the tool and passes refusals back', async () => {
    m.ctx = { role: 'agency_admin' };
    m.runTool.mockResolvedValue({ ok: true, data: { deleted: true } });
    await expect(deleteWebhookAction({ ok: true }, fd({ webhookId: ID }))).resolves.toEqual({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'delete_webhook', { webhookId: ID });
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    await expect(deleteWebhookAction({ ok: true }, fd({ webhookId: ID }))).resolves.toEqual({ ok: false, error: 'Not found' });
  });
});
