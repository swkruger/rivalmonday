import { signLink } from '@cs/core/server';
import { agency, brief, contact } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateAuth } from '../../test/auth-fixtures';

// 13a1 N3 / P5: `GET /l/<token>` host rules, through the real route, request-host and openLink.
const S = 'k'.repeat(40);
const m = vi.hoisted(() => ({ dbs: null as unknown, host: {} as Record<string, string> }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(m.host) }));
vi.mock('@/server/auth', () => ({ requestAuth: async () => ({ api: { getSession: async () => null } }) }));
vi.mock('@/server/db', () => ({ dbs: () => m.dbs }));
vi.mock('@/server/env', () => ({
  webEnv: () => ({ linkSecrets: [S], appUrl: 'http://localhost:3000', hostEnv: { appUrl: 'http://localhost:3000', neutralDomain: 'localhost', extraPlatformHosts: [] } }),
}));

const dbs = openTestDbs();
m.dbs = dbs;
afterAll(() => dbs.closeAll());
const { GET } = await import('@/app/l/[token]/route');

const NOW = new Date();
let clientContact = '';
let agencyContact = '';
let briefId = '';
const slugOf = async (id: string) => (await dbs.service.select({ s: agency.hostSlug }).from(agency).where(eq(agency.id, id)))[0]!.s;
const onAgency = async (id: string) => {
  const origin = `http://${await slugOf(id)}.localhost:3000`;
  m.host = { 'x-rm-host-kind': 'agency', 'x-rm-host-agency': id, 'x-rm-origin': origin };
  return origin;
};
const token = (sub: string) => signLink(S, { sub, agency: IDS.agencyA, client: IDS.clientA1, t: 'brief', id: briefId }, NOW);
const call = (tok: string) => GET(new Request(`http://internal/l/${tok}`), { params: Promise.resolve({ token: tok }) });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  m.host = {};
  const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'p@e.co' }).returning();
  const [a] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'account_manager', email: 'am@e.co' }).returning();
  clientContact = c!.id;
  agencyContact = a!.id;
  const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: NOW, periodEnd: NOW, status: 'sent' }).returning();
  briefId = b!.id;
});

describe('GET /l/<token> host rules', () => {
  it('/l token of a client contact on the platform → 307 to the agency host with no-store', async () => {
    const tok = token(clientContact);
    const res = await call(tok);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`http://${await slugOf(IDS.agencyA)}.localhost:3000/l/${tok}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('/l token of another agency on an agency host → link-expired', async () => {
    const bOrigin = await onAgency(IDS.agencyB);
    const res = await call(token(clientContact));
    expect(res.headers.get('location')).toBe(`${bOrigin}/link-expired`);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('agency staff token stays on the platform', async () => {
    const res = await call(token(agencyContact));
    expect(res.headers.get('location')).toBe(`http://localhost:3000/sign-in?next=${encodeURIComponent(`/c/${IDS.clientA1}/briefs/${briefId}`)}`);
  });

  it('a client contact token on its own agency host sets the guest cookie there', async () => {
    const aOrigin = await onAgency(IDS.agencyA);
    const res = await call(token(clientContact));
    expect(res.headers.get('location')).toBe(`${aOrigin}/c/${IDS.clientA1}/briefs/${briefId}`);
    expect(res.headers.get('set-cookie')).toMatch(/^rm_guest=/);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
