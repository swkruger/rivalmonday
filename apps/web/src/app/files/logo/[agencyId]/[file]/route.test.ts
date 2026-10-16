import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ objects: new Map<string, Uint8Array>(), env: 'dev' as string, storeEnv: [] as (string | undefined)[] }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => m.env }));
vi.mock('@/server/store', () => ({
  webStore: (name?: string) => {
    m.storeEnv.push(name);
    return { get: async (k: string) => m.objects.get(k) ?? null };
  },
}));
const { GET } = await import('./route');

const AG = '6b1f2a3c-4d5e-4f60-8a9b-0c1d2e3f4a5b';
const SHA = 'ab'.repeat(32);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
const get = (agencyId: string, file: string) => GET(new Request(`https://app.example/files/logo/${agencyId}/${file}`), { params: Promise.resolve({ agencyId, file }) });

beforeEach(() => {
  m.objects.clear();
  m.storeEnv = [];
  m.objects.set(`logos/${AG}/${SHA}.png`, PNG);
});

describe('GET /files/logo/[agencyId]/[file]', () => {
  it('serves a stored logo as an immutable, nosniff PNG (no session needed)', async () => {
    m.env = 'demo';
    const res = await get(AG, `${SHA}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect(m.storeEnv).toEqual(['demo']); // the active environment's store
    m.env = 'dev';
  });

  it('404s for a missing object', async () => {
    expect((await get(AG, `${'cd'.repeat(32)}.png`)).status).toBe(404);
  });

  it.each([
    ['non-uuid agency', 'not-a-uuid', `${SHA}.png`],
    ['traversal agency', '..', `${SHA}.png`],
    ['uppercase hash', AG, `${SHA.toUpperCase()}.png`],
    ['short hash', AG, 'abc.png'],
    ['svg extension', AG, `${SHA}.svg`],
    ['traversal file', AG, `../${SHA}.png`],
    ['trailing junk', AG, `${SHA}.png.html`],
    ['no extension', AG, SHA],
  ])('404s without touching the store for a bad name (%s)', async (_n, agencyId, file) => {
    const res = await get(agencyId, file);
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control') ?? '').not.toContain('immutable');
    expect(m.storeEnv).toEqual([]);
  });
});
