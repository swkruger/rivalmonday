import { type AccessContext, createAccessContext } from '@cs/core';
import { client, contact, lead, platformAdmin, platformAuditLog, type SetupLookup } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport } from '@cs/email';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const lookup: SetupLookup = { placeId: 'pl-smith-1', cid: null, title: 'Smith Dental', address: '1 Main St', city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 30.2, lng: -97.7 };
const ctxOf = (userId: string, role: AccessContext['role'] = 'agency_admin') => createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: 'all', features: [] });
const owner = ctxOf('op');
const staff = ctxOf('staff');
const viewer = ctxOf('viewer');
const agencyAdmin = ctxOf('admin');

let transport: ReturnType<typeof createMemoryTransport>;
const deps = (): ToolDeps => ({
  app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'],
  leadEmail: { transport, appUrl: 'https://app.test', fromAddress: 'briefs@app.test', platformAdmins: ['op@example.com'] },
});
const call = <T = unknown>(ctx: AccessContext, tool: string, input: Record<string, unknown> = {}) =>
  createToolRegistry(deps(), { audit: { record: async () => {} } }).invoke(ctx, tool, input) as Promise<T>;
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string; userFacing?: boolean }; }
  throw new Error('expected a failure');
};
async function mkLead(over: Partial<typeof lead.$inferInsert> = {}): Promise<string> {
  const [l] = await dbs.service.insert(lead).values({ agencyId: null, source: 'platform', status: 'verified', contactName: 'Sam Smith', email: 'Sam@Smith.co', lookup, preview: { status: 'failed' }, verifiedAt: new Date(), ...over }).returning();
  return l!.id;
}
const leadRow = async (id: string) => (await dbs.service.select().from(lead).where(eq(lead.id, id)))[0]!;

beforeEach(async () => {
  transport = createMemoryTransport();
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['op', 'staff', 'viewer', 'admin']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'viewer', role: 'viewer', createdBy: 'test' },
  ]);
  await dbs.service.insert(contact).values({ agencyId: IDS.agencyB, role: 'agency_admin', email: 'admin@b.co', name: 'Bea' });
});

describe('list_pool_leads', () => {
  it('lists only verified pool leads and agencies with active-client counts; agency admins are refused', async () => {
    const pool = await mkLead();
    await mkLead({ email: 'x@y.co', status: 'unverified' });
    await mkLead({ email: 'z@y.co', agencyId: IDS.agencyA, source: 'agency_link' });
    const out = await call<{ leads: { id: string; businessName: string }[]; agencies: { id: string; activeClients: number; verticals: string[] }[] }>(viewer, 'list_pool_leads');
    expect(out.leads.map((l) => l.id)).toEqual([pool]);
    expect(out.leads[0]!.businessName).toBe('Smith Dental');
    const a = out.agencies.find((x) => x.id === IDS.agencyA)!;
    const n = (await dbs.owner.select().from(client).where(eq(client.agencyId, IDS.agencyA))).filter((c) => c.status === 'active').length;
    expect(a.activeClients).toBe(n);
    expect(a.verticals.length).toBeGreaterThan(0);
    expect((await fails(call(agencyAdmin, 'list_pool_leads'))).code).toBe('permission_denied');
  });
});

describe('assign_lead', () => {
  it('assign audited', async () => {
    const id = await mkLead();
    await call(owner, 'assign_lead', { leadId: id, agencyId: IDS.agencyB });
    expect(await leadRow(id)).toMatchObject({ agencyId: IDS.agencyB, assignedBy: 'op' });
    expect((await leadRow(id)).assignedAt).toBeInstanceOf(Date);
    const audit = await dbs.owner.select().from(platformAuditLog);
    expect(audit.map((a) => [a.tool, a.outcome, a.userId])).toEqual([['assign_lead', 'ok', 'op']]);
  });

  it('viewer cannot assign', async () => {
    const id = await mkLead();
    expect((await fails(call(viewer, 'assign_lead', { leadId: id, agencyId: IDS.agencyB }))).code).toBe('permission_denied');
    expect((await leadRow(id)).agencyId).toBeNull();
    expect(await dbs.owner.select().from(platformAuditLog)).toEqual([]);
  });

  it('staff can assign', async () => {
    const id = await mkLead();
    await call(staff, 'assign_lead', { leadId: id, agencyId: IDS.agencyB });
    expect((await leadRow(id)).agencyId).toBe(IDS.agencyB);
  });

  it('non-pool lead refused', async () => {
    const held = await mkLead({ agencyId: IDS.agencyA, email: 'a@a.co' });
    const unverified = await mkLead({ status: 'unverified', email: 'u@u.co' });
    for (const id of [held, unverified]) expect((await fails(call(owner, 'assign_lead', { leadId: id, agencyId: IDS.agencyB }))).code).toBe('not_found');
    expect((await leadRow(held)).agencyId).toBe(IDS.agencyA);
  });

  it('agency notified once', async () => {
    const id = await mkLead();
    await call(owner, 'assign_lead', { leadId: id, agencyId: IDS.agencyB });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.to).toBe('admin@b.co');
    expect((await leadRow(id)).agencyNotifiedAt).toBeInstanceOf(Date);
    // A second assign is refused (no longer in the pool), so nothing more goes out.
    await fails(call(owner, 'assign_lead', { leadId: id, agencyId: IDS.agencyB }));
    expect(transport.sent).toHaveLength(1);
  });

  it('refuses a collision with an open lead the agency already holds', async () => {
    const id = await mkLead();
    await mkLead({ agencyId: IDS.agencyB, source: 'agency_link', email: 'sam@smith.co' });
    const e = await fails(call(owner, 'assign_lead', { leadId: id, agencyId: IDS.agencyB }));
    expect(e).toMatchObject({ code: 'conflict', message: 'This agency already has this lead.', userFacing: true });
    expect((await leadRow(id)).agencyId).toBeNull();
  });

  it('unknown agency is not_found', async () => {
    const id = await mkLead();
    expect((await fails(call(owner, 'assign_lead', { leadId: id, agencyId: '11111111-1111-4111-8111-111111111111' }))).code).toBe('not_found');
  });
});
