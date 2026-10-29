import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ key: vi.fn(), get: vi.fn() }));
vi.mock('@cs/tools', () => ({
  sampleEvidenceKey: (...a: unknown[]) => m.key(...a),
  evidenceContentType: (k: string) => ({ screenshot: 'image/webp', text: 'text/plain; charset=utf-8' } as Record<string, string>)[k],
}));
vi.mock('@/server/db', () => ({ dbs: (env: string) => ({ service: `svc-${env}` }) }));
vi.mock('@/server/store', () => ({ webStore: () => ({ get: (k: string) => m.get(k) }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ authSecret: 'AUTH-SECRET' }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'dev' }));
const { GET } = await import('./route');

const call = (token = 'TOKEN', evidenceId = 'E1') => GET(new Request(`http://internal/sample/${token}/evidence/${evidenceId}`), { params: Promise.resolve({ token, evidenceId }) });
beforeEach(() => {
  m.key.mockReset();
  m.get.mockReset();
});

describe('GET /sample/<token>/evidence/<id>', () => {
  it('evidence route serves cited screenshot, 404 otherwise, headers exact', async () => {
    m.key.mockResolvedValue({ objectKey: 'evidence/x/y/screenshot', kind: 'screenshot' });
    m.get.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const res = await call();
    expect(m.key.mock.calls[0]!.slice(0, 4)).toEqual(['svc-dev', 'TOKEN', 'AUTH-SECRET', 'E1']);
    expect(m.get).toHaveBeenCalledWith('evidence/x/y/screenshot');
    expect(res.status).toBe(200);
    expect(Object.fromEntries(res.headers.entries())).toEqual({
      'content-type': 'image/webp', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store', 'content-disposition': 'inline', 'referrer-policy': 'no-referrer',
    });
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);

    m.key.mockResolvedValue(null); // bad token, not cited, html/vendor_json
    let r = await call();
    expect([r.status, await r.text()]).toEqual([404, 'Not found']);
    m.key.mockResolvedValue({ objectKey: 'k', kind: 'screenshot' });
    m.get.mockResolvedValue(null); // missing object
    r = await call();
    expect([r.status, await r.text()]).toEqual([404, 'Not found']);
  });
});
