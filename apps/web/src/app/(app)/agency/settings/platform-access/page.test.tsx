// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: { kind: 'user' } as { kind: string }, ctx: { role: 'agency_admin' } as Record<string, unknown>, callTool: vi.fn(), runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: m.viewer, ctx: m.ctx }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
const { default: Page } = await import('./page');
const { setSupportNotifyAction } = await import('./actions');

const row = { startedAt: '2026-10-12T10:00:00Z', endedAt: '2026-10-12T10:12:00Z', platformUserName: 'Sam Staff', reason: 'Checking brief setup', durationMinutes: 12, endReason: 'expired' };
const page = (sp: Record<string, string> = {}) => Page({ searchParams: Promise.resolve(sp) });

beforeEach(() => {
  m.viewer = { kind: 'user' };
  m.ctx = { role: 'agency_admin' };
  m.callTool.mockReset();
  m.runTool.mockReset();
});

describe('/agency/settings/platform-access', () => {
  it('lists the sessions (started, ended, user, reason, duration, end reason) and the notify toggle', async () => {
    m.callTool.mockResolvedValue({ rows: [row], nextCursor: null, notifyEnabled: true });
    render(await page());
    expect(m.callTool).toHaveBeenCalledWith(m.ctx, 'list_support_sessions', {});
    for (const h of ['Started', 'Ended', 'Platform user', 'Reason', 'Duration', 'End reason']) expect(screen.getByRole('columnheader', { name: h })).toBeTruthy();
    expect(screen.getByText('Sam Staff')).toBeTruthy();
    expect(screen.getByText('Checking brief setup')).toBeTruthy();
    expect(screen.getByText('12 min')).toBeTruthy();
    expect(screen.getByText('Timed out')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Email me when platform support opens a session' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('shows the empty state and pages with ?cursor=', async () => {
    m.callTool.mockResolvedValue({ rows: [], nextCursor: 'next', notifyEnabled: false });
    render(await page({ cursor: 'c1' }));
    expect(m.callTool).toHaveBeenCalledWith(m.ctx, 'list_support_sessions', { cursor: 'c1' });
    expect(screen.getByText('No support sessions')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Older sessions' }).getAttribute('href')).toBe('/agency/settings/platform-access?cursor=next');
  });

  it('404s for every other role and for a support viewer', async () => {
    for (const role of ['account_manager', 'client_owner', 'client_viewer']) {
      m.ctx = { role };
      await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    }
    m.viewer = { kind: 'support' };
    m.ctx = { role: 'agency_admin', support: { sessionId: 's', platformUserId: 'op' } };
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.callTool).not.toHaveBeenCalled();
  });

  it('the toggle goes through set_support_access_notify with runTool', async () => {
    m.callTool.mockResolvedValue({ rows: [], nextCursor: null, notifyEnabled: false });
    m.runTool.mockResolvedValue({ ok: true, data: { enabled: true } });
    render(await page());
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'set_support_access_notify', { enabled: true }));
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    expect(await setSupportNotifyAction(false)).toEqual({ ok: false, error: 'Not found' });
  });
});
