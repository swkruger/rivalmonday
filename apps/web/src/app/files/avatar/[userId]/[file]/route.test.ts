import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ objects: new Map<string, Uint8Array>(), viewer: null as Record<string, unknown> | null, storeCalls: 0 }));
vi.mock('@/server/current-viewer', () => ({ getViewer: async () => m.viewer }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'dev' }));
vi.mock('@/server/store', () => ({
  webStore: () => {
    m.storeCalls++;
    return { get: async (k: string) => m.objects.get(k) ?? null };
  },
}));
const { GET } = await import('./route');

const UID = 'Xk3mQ9vLp2RtZa7WbN4cYd8EfG1hJ5sU';
const SHA = 'ab'.repeat(32);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7, 7]);
const get = (userId: string, file: string) => GET(new Request('https://app.example/x'), { params: Promise.resolve({ userId, file }) });

beforeEach(() => {
  m.objects.clear();
  m.storeCalls = 0;
  m.viewer = { kind: 'user', userId: UID };
  m.objects.set(`avatars/${UID}/${SHA}.png`, PNG);
});

describe('GET /files/avatar/[userId]/[file]', () => {
  it('serves the owner their photo as a private, immutable, nosniff PNG', async () => {
    const res = await get(UID, `${SHA}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it('serves a support viewer their own photo', async () => {
    m.viewer = { kind: 'support', userId: UID };
    expect((await get(UID, `${SHA}.png`)).status).toBe(200);
  });

  it.each([
    ['another user', { kind: 'user', userId: 'someone-else' }],
    ['another user in support', { kind: 'support', userId: 'someone-else' }],
    ['a guest', { kind: 'guest', ctx: {} }],
    ['member-less', { kind: 'member-less', userId: UID }],
    ['signed out', null],
  ])('404s for %s', async (_n, viewer) => {
    m.viewer = viewer;
    expect((await get(UID, `${SHA}.png`)).status).toBe(404);
  });

  it('404s for a missing object', async () => {
    expect((await get(UID, `${'cd'.repeat(32)}.png`)).status).toBe(404);
  });

  it.each([
    ['dot-dot user', '..', `${SHA}.png`],
    ['dotted user', 'a.b', `${SHA}.png`],
    ['slash user', 'a/b', `${SHA}.png`],
    ['empty user', '', `${SHA}.png`],
    ['long user', 'a'.repeat(65), `${SHA}.png`],
    ['uppercase hash', UID, `${SHA.toUpperCase()}.png`],
    ['svg extension', UID, `${SHA}.svg`],
    ['traversal file', UID, `../${SHA}.png`],
    ['trailing junk', UID, `${SHA}.png.html`],
  ])('404s without touching the store for a bad name (%s)', async (_n, userId, file) => {
    expect((await get(userId, file)).status).toBe(404);
    expect(m.storeCalls).toBe(0);
  });
});
