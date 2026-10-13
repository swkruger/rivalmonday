import { ToolError } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  viewer: null as unknown,
  listInbox: vi.fn(async () => [] as unknown[]),
  markRead: vi.fn(async () => {}),
  markAllRead: vi.fn(async () => {}),
}));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => m.viewer }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'http://localhost:3000' }) }));
vi.mock('@cs/tools', () => ({ listInbox: m.listInbox, markRead: m.markRead, markAllRead: m.markAllRead }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: () => { throw new Error('NEXT_REDIRECT'); },
}));
const { default: InboxPage } = await import('./page');
const { markAllReadAction, openNotification } = await import('./actions');

const supportViewer = {
  viewer: { kind: 'support', userId: 'op', name: 'Op', email: 'op@rm.app' },
  ctx: { userId: 'op', support: { sessionId: 's1', platformUserId: 'op' } },
};
const userViewer = { viewer: { kind: 'user', userId: 'u1', name: 'U', email: 'u@x.io' }, ctx: { userId: 'u1' } };
const form = (id: string) => { const f = new FormData(); f.set('id', id); return f; };

beforeEach(() => {
  m.listInbox.mockClear();
  m.markRead.mockClear();
  m.markAllRead.mockClear();
});

describe('inbox in a support session (8b R9)', () => {
  it('the page 404s and never reads the operator inbox', async () => {
    m.viewer = supportViewer;
    await expect(InboxPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.listInbox).not.toHaveBeenCalled();
  });

  it('markAllRead and openNotification are refused with read_only_session and write nothing', async () => {
    m.viewer = supportViewer;
    await expect(markAllReadAction()).rejects.toMatchObject({ code: 'read_only_session' });
    const err = await openNotification(form('n1')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err).toMatchObject({ code: 'read_only_session' });
    expect(m.markRead).not.toHaveBeenCalled();
    expect(m.markAllRead).not.toHaveBeenCalled();
  });

  it('still works for a normal user', async () => {
    m.viewer = userViewer;
    await markAllReadAction();
    expect(m.markAllRead).toHaveBeenCalledWith({}, { userId: 'u1' });
  });
});
