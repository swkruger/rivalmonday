import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), endOpen: vi.fn(), ctx: { userId: 'op', agencyId: 'own-agency' } }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('@cs/tools', () => ({ endOpenSessionFor: (...a: unknown[]) => m.endOpen(...a) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'service-db' }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.example' }) }));
const { POST } = await import('./route');

const AG = '22222222-2222-4222-8222-222222222222';
const post = (origin: string | null) =>
  POST(new NextRequest('https://app.example/support/exit', { method: 'POST', headers: { ...(origin ? { origin } : {}), cookie: 'rm_support=abc.def' } }));

beforeEach(() => {
  m.runTool.mockReset();
  m.endOpen.mockReset().mockResolvedValue(null);
});

describe('POST /support/exit', () => {
  it('ends the operator own session on the operator ctx, clears rm_support and 303s to the agency page with ?ended=1', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { agencyId: AG } });
    const res = await post('https://app.example');
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'end_support_session', {});
    expect(m.endOpen).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`https://app.example/platform/agencies/${AG}?ended=1`);
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/rm_support=;/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
  });

  it('goes to /platform when no session was open (or the tool refused), still clearing the cookie', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { agencyId: null } });
    let res = await post('https://app.example');
    expect(res.headers.get('location')).toBe('https://app.example/platform');
    m.runTool.mockResolvedValue({ ok: false, error: 'Not found' });
    res = await post('https://app.example');
    expect(res.headers.get('location')).toBe('https://app.example/platform');
    expect(res.headers.get('set-cookie')).toMatch(/rm_support=;/);
  });

  it('a refused end_support_session falls back to ending the operator own open row directly', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Read-only support session â€” changes are disabled.' });
    m.endOpen.mockResolvedValue(AG);
    const res = await post('https://app.example');
    expect(m.endOpen).toHaveBeenCalledWith('service-db', 'op');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`https://app.example/platform/agencies/${AG}?ended=1`);
    expect(res.headers.get('set-cookie')).toMatch(/rm_support=;/);
  });

  it('still clears rm_support and 303s when the fallback end throws, logging only the error class', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Read-only support session — changes are disabled.' });
    m.endOpen.mockRejectedValue(new TypeError('connection string postgres://secret'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post('https://app.example');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://app.example/platform');
    expect(res.headers.get('set-cookie')).toMatch(/rm_support=;/);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret');
    spy.mockRestore();
  });

  it('rejects a cross-origin or Origin-less POST without ending anything', async () => {
    for (const o of ['https://evil.example', 'http://app.example', null]) {
      const res = await post(o);
      expect(res.status, String(o)).toBe(403);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
    expect(m.runTool).not.toHaveBeenCalled();
  });
});
