import { beforeEach, describe, expect, it, vi } from 'vitest';

const CL_ID = '6b1f2a3c-4d5e-4f60-8a9b-0c1d2e3f4a5b';
const m = vi.hoisted(() => ({
  objects: new Map<string, Uint8Array>(), env: 'dev' as string, storeEnv: [] as (string | undefined)[],
  host: { origin: 'https://app.example', info: { kind: 'platform' } } as unknown,
  clients: new Map<string, string>(), dbEnv: [] as (string | undefined)[], reads: 0,
}));
vi.mock('@/server/request-host', () => ({ requestHost: async () => m.host }));
vi.mock('@/server/db', () => ({
  dbs: (name?: string) => {
    m.dbEnv.push(name);
    // Minimal drizzle-shaped stub of service.select(...).from(client).where(...): the one test client, when known.
    const rows = () => { m.reads++; return m.clients.has(CL_ID) ? [{ agencyId: m.clients.get(CL_ID)! }] : []; };
    return { service: { select: () => ({ from: () => ({ where: async () => rows() }) }) } };
  },
}));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => m.env }));
vi.mock('@/server/store', () => ({
  webStore: (name?: string) => {
    m.storeEnv.push(name);
    return { get: async (k: string) => m.objects.get(k) ?? null };
  },
}));
const { GET } = await import('./route');

const CL = '6b1f2a3c-4d5e-4f60-8a9b-0c1d2e3f4a5b';
const SHA = 'ab'.repeat(32);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
const get = (clientId: string, file: string) => GET(new Request(`https://app.example/files/logo/clients/${clientId}/${file}`), { params: Promise.resolve({ clientId, file }) });

const AG_A = '11111111-1111-4111-8111-111111111111';
const AG_B = '22222222-2222-4222-8222-222222222222';
const onAgency = (agencyId: string) => {
  m.host = { origin: 'https://acme.neutral.example', info: { kind: 'agency', agencyId, canonical: true, canonicalOrigin: 'https://acme.neutral.example' } };
};

beforeEach(() => {
  m.objects.clear();
  m.storeEnv = [];
  m.dbEnv = [];
  m.reads = 0;
  m.host = { origin: 'https://app.example', info: { kind: 'platform' } };
  m.clients = new Map([[CL, AG_A]]);
  m.objects.set(`logos/clients/${CL}/${SHA}.png`, PNG);
});

describe('GET /files/logo/clients/[clientId]/[file]', () => {
  it('serves a stored logo as an immutable, nosniff PNG (no session needed)', async () => {
    const res = await get(CL, `${SHA}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it('logo 404 when object missing', async () => {
    expect((await get(CL, `${'cd'.repeat(32)}.png`)).status).toBe(404);
  });

  it.each([
    ['non-uuid client', 'not-a-uuid', `${SHA}.png`],
    ['traversal client', '..', `${SHA}.png`],
    ['uppercase hash', CL, `${SHA.toUpperCase()}.png`],
    ['short hash', CL, 'abc.png'],
    ['svg extension', CL, `${SHA}.svg`],
    ['traversal file', CL, `../${SHA}.png`],
    ['trailing junk', CL, `${SHA}.png.html`],
  ])('404s without touching the store for a bad name (%s)', async (_n, clientId, file) => {
    const res = await get(clientId, file);
    expect(res.status).toBe(404);
    expect(m.storeEnv).toEqual([]);
  });

  it('platform host: no client lookup (unchanged)', async () => {
    expect((await get(CL, `${SHA}.png`)).status).toBe(200);
    expect(m.reads).toBe(0);
  });

  it('client logo of another agency → 404', async () => {
    onAgency(AG_B);
    expect((await get(CL, `${SHA}.png`)).status).toBe(404);
    expect(m.storeEnv).toEqual([]);
    m.clients.clear(); // unknown client on an agency host: 404 too
    expect((await get(CL, `${SHA}.png`)).status).toBe(404);
    expect(m.storeEnv).toEqual([]);
  });

  it('client logo of the host agency serves, reading the active environment', async () => {
    onAgency(AG_A);
    const res = await get(CL, `${SHA}.png`);
    expect(res.status).toBe(200);
    expect(m.reads).toBe(1);
    expect(m.dbEnv).toEqual(['dev']);
  });
});
