import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as Record<string, unknown> | null, callTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ getViewer: async () => m.viewer }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a) }));
const { GET, csvCell } = await import('./route');

const admin = { kind: 'user', ctx: { role: 'agency_admin' } };
beforeEach(() => {
  m.viewer = admin;
  m.callTool.mockReset();
});

describe('seats.csv (billing)', () => {
  it('returns text/csv with the client,activated_on header and ISO dates', async () => {
    m.callTool.mockResolvedValue({ clients: [{ id: 'i1', name: 'Acme HVAC', activatedAt: '2026-09-03T22:15:00.000Z' }, { id: 'i2', name: 'Bob', activatedAt: '2026-10-01T00:00:00.000Z' }] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(await res.text()).toBe('client,activated_on\r\nAcme HVAC,2026-09-03\r\nBob,2026-10-01\r\n');
    expect(m.callTool).toHaveBeenCalledWith(admin.ctx, 'get_seat_report', {});
  });

  it('escapes quotes and commas and neutralises formula injection', () => {
    expect(csvCell('Smith, "Bob" & Sons')).toBe('"Smith, ""Bob"" & Sons"');
    for (const bad of ['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '\rx']) expect(csvCell(bad).replace(/^"/, '').startsWith("'")).toBe(true);
    expect(csvCell('Plain')).toBe('Plain');
  });

  it('404s for a signed-out caller, guests, support sessions and any tool refusal (non-admins)', async () => {
    for (const v of [null, { kind: 'guest', ctx: { role: 'client_viewer' } }, { kind: 'support', ctx: { role: 'agency_admin' } }]) {
      m.viewer = v;
      expect((await GET()).status).toBe(404);
    }
    expect(m.callTool).not.toHaveBeenCalled();
    m.viewer = { kind: 'user', ctx: { role: 'account_manager' } };
    m.callTool.mockRejectedValue(Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }));
    expect((await GET()).status).toBe(404);
  });
});
