import { agencyOnboarding } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { unsubscribeToken } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const SECRET = vi.hoisted(() => 'web-test-auth-secret-0123456789abcdefghijkl');
vi.mock('@/server/db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'http://localhost:3000', authSecret: SECRET }) }));
const { GET, POST } = await import('./route');

const at = async () => (await dbs.owner.select({ u: agencyOnboarding.unsubscribedAt }).from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, IDS.agencyA)))[0]!.u;
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const url = (token: string) => `http://localhost:3000/u/${token}`;
const form = (token: string, body: string) =>
  POST(new Request(url(token), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }), ctx(token));
const oneClick = (token: string) => form(token, 'List-Unsubscribe=One-Click');
let token: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'open' });
  token = unsubscribeToken(IDS.agencyA, SECRET);
});

describe('/u/[token] route', () => {
  it('GET changes nothing and sends the browser to the confirm page', async () => {
    const res = await GET(new Request(url(token)), ctx(token));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`http://localhost:3000/u/${token}/confirm`);
    expect(await at()).toBeNull();
  });

  it('GET with a bad token is a 404', async () => {
    expect((await GET(new Request(url('nope')), ctx('nope'))).status).toBe(404);
  });

  it('one-click POST (RFC 8058) sets unsubscribed_at and answers 200 with the confirmation', async () => {
    const res = await oneClick(token);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You won't get setup tips any more.");
    expect(await at()).not.toBeNull();
  });

  it('one-click POST as multipart form data also answers 200', async () => {
    const fd = new FormData();
    fd.set('List-Unsubscribe', 'One-Click');
    const res = await POST(new Request(url(token), { method: 'POST', body: fd }), ctx(token));
    expect(res.status).toBe(200);
    expect(await at()).not.toBeNull();
  });

  it('a POST with no body still unsubscribes (redirect to done)', async () => {
    const res = await POST(new Request(url(token), { method: 'POST' }), ctx(token));
    expect(res.status).toBe(303);
    expect(await at()).not.toBeNull();
  });

  it('the confirm form POST sets unsubscribed_at and redirects to the done page', async () => {
    const res = await form(token, '');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`http://localhost:3000/u/${token}/done`);
    expect(await at()).not.toBeNull();
  });

  it('POST with a bad or tampered token is a 404 and changes nothing', async () => {
    const bad = `${token.slice(0, -2)}${token.endsWith('AA') ? 'AB' : 'AA'}`;
    expect((await oneClick(bad)).status).toBe(404);
    expect((await oneClick('x')).status).toBe(404);
    expect(await at()).toBeNull();
  });
});
