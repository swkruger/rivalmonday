import { hashInput } from '@cs/core/server';
import { agency, agencyBilling, type Db, auditLog, capture, client, clientBilling, contact, evidence, llmCall, membership, platformAuditLog, trackedPage, vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveTenant, purgeArchived } from './purge';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-21T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const PAGE = '00000000-0000-4000-8000-0000000000e1';
const CAP = '00000000-0000-4000-8000-0000000000e2';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

async function addUser(id: string) {
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${id}, ${id + '@example.com'}, true)`);
}
async function audit(agencyId: string, userId: string) {
  await dbs.service.insert(auditLog).values({ agencyId, userId, role: 'x', tool: 'list_clients', inputHash: 'h', outcome: 'ok', durationMs: 1 });
}
const auditUsers = async (agencyId: string) =>
  (await dbs.owner.select({ userId: auditLog.userId }).from(auditLog).where(eq(auditLog.agencyId, agencyId))).map((r) => r.userId).sort();
const archivedAt = async (table: typeof agency | typeof client, id: string) =>
  (await dbs.owner.select({ at: table.archivedAt }).from(table).where(eq(table.id, id)))[0]?.at;
const exists = async (table: typeof agency | typeof client, id: string) => (await dbs.owner.select({ id: table.id }).from(table).where(eq(table.id, id))).length === 1;
const platformRows = () => dbs.owner.select().from(platformAuditLog).orderBy(platformAuditLog.createdAt);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
});

describe('archiveTenant', () => {
  it('archive then --undo clears archived_at, one platform audit row each', async () => {
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA1, undo: false }, NOW)).toEqual({ ok: true });
    expect(await archivedAt(client, IDS.clientA1)).toEqual(NOW);
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA1, undo: true }, NOW)).toEqual({ ok: true });
    expect(await archivedAt(client, IDS.clientA1)).toBeNull();
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyB, undo: false }, NOW)).toEqual({ ok: true });
    expect(await archivedAt(agency, IDS.agencyB)).toEqual(NOW);
    const rows = await platformRows();
    expect(rows.map((r) => [r.userId, r.tool, r.outcome])).toEqual([
      ['cli', 'archive_client', 'ok'],
      ['cli', 'unarchive_client', 'ok'],
      ['cli', 'archive_agency', 'ok'],
    ]);
    expect(rows[0]!.inputHash).toBe(hashInput({ kind: 'client', id: IDS.clientA1, undo: false }));
  });

  it('re-archiving keeps the original archived_at (the purge clock does not restart)', async () => {
    await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyB, undo: false }, daysAgo(40));
    await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyB, undo: false }, NOW);
    expect(await archivedAt(agency, IDS.agencyB)).toEqual(daysAgo(40));
  });

  it('unknown id is not_found and writes no audit row', async () => {
    const r = await archiveTenant(dbs.service, { kind: 'agency', id: UNKNOWN, undo: false }, NOW);
    expect(r).toMatchObject({ error: 'not_found' });
    expect(await archiveTenant(dbs.service, { kind: 'client', id: UNKNOWN, undo: true }, NOW)).toMatchObject({ error: 'not_found' });
    expect(await platformRows()).toHaveLength(0);
  });

  it.each(['trialing', 'active', 'past_due', 'read_only', 'suspended'] as const)('refuses an agency with a live Stripe subscription (%s)', async (state) => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state, stripeSubscriptionId: 'sub_1' });
    const r = await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: false }, NOW);
    expect(r).toMatchObject({ error: 'billing_active' });
    if ('error' in r) expect(r.message).toMatch(/cancel the subscription in Stripe first/i);
    expect(await archivedAt(agency, IDS.agencyA)).toBeNull();
    expect(await platformRows()).toHaveLength(0);
  });

  it.each([
    ['pilot', 'sub_1'],
    ['cancelled', 'sub_1'],
    ['active', null],
  ] as const)('allows an agency in %s with subscription %s', async (state, sub) => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state, stripeSubscriptionId: sub });
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: false }, NOW)).toEqual({ ok: true });
  });

  it.each(['active', 'payment_needed'] as const)('refuses a client (and its agency) with enabled client billing in %s', async (state) => {
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, enabled: true, state, stripeSubscriptionId: 'sub_c' });
    const onClient = await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA2, undo: false }, NOW);
    expect(onClient).toMatchObject({ error: 'billing_active' });
    if ('error' in onClient) expect(onClient.message).toMatch(/cancel the subscription in Stripe first/i);
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: false }, NOW)).toMatchObject({ error: 'billing_active' });
    expect(await archivedAt(client, IDS.clientA2)).toBeNull();
    expect(await archivedAt(agency, IDS.agencyA)).toBeNull();
    // Another client of the agency is not blocked by its sibling's billing.
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA1, undo: false }, NOW)).toEqual({ ok: true });
  });

  it.each([
    [false, 'active'],
    [true, 'cancelled'],
    [true, 'invited'],
    [true, 'off'],
  ] as const)('allows a client with client billing enabled=%s state %s', async (enabled, state) => {
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, enabled, state });
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA2, undo: false }, NOW)).toEqual({ ok: true });
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: false }, NOW)).toEqual({ ok: true });
  });

  it('--undo is never refused', async () => {
    await dbs.owner.update(agency).set({ archivedAt: daysAgo(5) }).where(eq(agency.id, IDS.agencyA));
    await dbs.owner.update(client).set({ archivedAt: daysAgo(5) }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'active', stripeSubscriptionId: 'sub_1' });
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, enabled: true, state: 'active' });
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: true }, NOW)).toEqual({ ok: true });
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA2, undo: true }, NOW)).toEqual({ ok: true });
    expect(await archivedAt(agency, IDS.agencyA)).toBeNull();
    expect(await archivedAt(client, IDS.clientA2)).toBeNull();
  });
});

describe('purgeArchived', () => {
  it('purge deletes an agency archived 91 days ago and keeps its audit_log/llm_call/vendor_call rows with user_id purged', async () => {
    await addUser('admin-a');
    await dbs.service.insert(membership).values({ userId: 'admin-a', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' });
    await dbs.service.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'cancelled' });
    await audit(IDS.agencyA, 'admin-a');
    await audit(IDS.agencyA, 'contact:x');
    await audit(IDS.agencyB, 'admin-b');
    const call = { agencyId: IDS.agencyA, clientId: IDS.clientA1, latencyMs: 1, ok: true };
    await dbs.service.insert(llmCall).values({ ...call, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1 });
    await dbs.service.insert(vendorCall).values({ ...call, vendor: 'v', operation: 'o', units: 1 });
    await dbs.owner.update(agency).set({ archivedAt: daysAgo(91) }).where(eq(agency.id, IDS.agencyA));

    expect(await purgeArchived(dbs.service, { olderThanDays: 90, dryRun: false, now: NOW })).toEqual({ agencies: 1, clients: 0, auditAnonymised: 2 });
    expect(await exists(agency, IDS.agencyA)).toBe(false);
    expect(await dbs.owner.select().from(client).where(eq(client.agencyId, IDS.agencyA))).toHaveLength(0);
    expect(await dbs.owner.select().from(membership)).toHaveLength(0);
    expect(await auditUsers(IDS.agencyA)).toEqual(['purged', 'purged']);
    expect(await auditUsers(IDS.agencyB)).toEqual(['admin-b']);
    expect(await dbs.owner.select({ a: llmCall.agencyId, c: llmCall.clientId }).from(llmCall)).toEqual([{ a: IDS.agencyA, c: IDS.clientA1 }]);
    expect(await dbs.owner.select({ a: vendorCall.agencyId, c: vendorCall.clientId }).from(vendorCall)).toEqual([{ a: IDS.agencyA, c: IDS.clientA1 }]);
    // Better Auth users stay (Decision 7).
    expect([...(await dbs.owner.execute(sql`select id from auth."user"`))]).toHaveLength(1);
    // One platform audit row per run.
    const rows = await platformRows();
    expect(rows.map((r) => [r.userId, r.tool, r.outcome])).toEqual([['cli', 'purge_archived', 'ok']]);
    expect(rows[0]!.inputHash).toBe(hashInput({ olderThanDays: 90 }));
  });

  it('skips one archived 10 days ago', async () => {
    await dbs.owner.update(agency).set({ archivedAt: daysAgo(10) }).where(eq(agency.id, IDS.agencyB));
    await dbs.owner.update(client).set({ archivedAt: daysAgo(10) }).where(eq(client.id, IDS.clientA2));
    await audit(IDS.agencyB, 'admin-b');
    expect(await purgeArchived(dbs.service, { olderThanDays: 90, dryRun: false, now: NOW })).toEqual({ agencies: 0, clients: 0, auditAnonymised: 0 });
    expect(await exists(agency, IDS.agencyB)).toBe(true);
    expect(await exists(client, IDS.clientA2)).toBe(true);
    expect(await auditUsers(IDS.agencyB)).toEqual(['admin-b']);
  });

  it('client purge anonymises a client-only user but not one with another membership', async () => {
    for (const u of ['owner-a2', 'multi', 'staff', 'owner-a1']) await addUser(u);
    await dbs.service.insert(membership).values([
      { userId: 'owner-a2', agencyId: IDS.agencyA, clientId: IDS.clientA2, role: 'client_owner', createdBy: 't' },
      { userId: 'multi', agencyId: IDS.agencyA, clientId: IDS.clientA2, role: 'client_owner', createdBy: 't' },
      { userId: 'multi', agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', createdBy: 't' },
      { userId: 'staff', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' },
      { userId: 'owner-a1', agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', createdBy: 't' },
    ]);
    const [guest] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, role: 'client_viewer', email: 'g@a2.example' }).returning({ id: contact.id });
    const [otherGuest] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'g@a1.example' }).returning({ id: contact.id });
    for (const u of ['owner-a2', 'multi', 'staff', 'owner-a1', `contact:${guest!.id}`, `contact:${otherGuest!.id}`]) await audit(IDS.agencyA, u);
    await audit(IDS.agencyB, 'owner-a2'); // another agency's log is never touched
    await dbs.owner.update(client).set({ archivedAt: daysAgo(91) }).where(eq(client.id, IDS.clientA2));

    expect(await purgeArchived(dbs.service, { olderThanDays: 90, dryRun: false, now: NOW })).toEqual({ agencies: 0, clients: 1, auditAnonymised: 2 });
    expect(await exists(client, IDS.clientA2)).toBe(false);
    expect(await exists(client, IDS.clientA1)).toBe(true);
    expect(await auditUsers(IDS.agencyA)).toEqual(['contact:' + otherGuest!.id, 'multi', 'owner-a1', 'purged', 'purged', 'staff'].sort());
    expect(await auditUsers(IDS.agencyB)).toEqual(['owner-a2']);
    expect((await dbs.owner.select({ u: membership.userId }).from(membership)).map((r) => r.u).sort()).toEqual(['multi', 'owner-a1', 'staff']);
  });

  it('a client archived long ago inside an archived (not yet due) agency is left for the agency purge', async () => {
    await dbs.owner.update(agency).set({ archivedAt: daysAgo(10) }).where(eq(agency.id, IDS.agencyA));
    await dbs.owner.update(client).set({ archivedAt: daysAgo(200) }).where(eq(client.id, IDS.clientA2));
    expect(await purgeArchived(dbs.service, { olderThanDays: 90, dryRun: false, now: NOW })).toEqual({ agencies: 0, clients: 0, auditAnonymised: 0 });
    expect(await exists(client, IDS.clientA2)).toBe(true);
  });

  it('evidence and capture rows unchanged', async () => {
    await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'sitemap', cadence: 'daily' });
    await dbs.service.insert(capture).values({ id: CAP, competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', url: 'https://smithhvac.example/pricing', status: 'ok', httpStatus: 200, collectorVersion: 'web/1' });
    await dbs.service.insert(evidence).values({ captureId: CAP, kind: 'text', objectKey: `evidence/${IDS.competitorX}/${CAP}/text.txt`, sha256: 'a'.repeat(64), bytes: 10, contentType: 'text/plain' });
    const before = { c: await dbs.owner.select().from(capture), e: await dbs.owner.select().from(evidence) };
    // Both tenants that track competitor X go: agency A (whole) and client B1 (agency B stays).
    await dbs.owner.update(agency).set({ archivedAt: daysAgo(91) }).where(eq(agency.id, IDS.agencyA));
    await dbs.owner.update(client).set({ archivedAt: daysAgo(91) }).where(eq(client.id, IDS.clientB1));
    expect(await purgeArchived(dbs.service, { olderThanDays: 90, dryRun: false, now: NOW })).toMatchObject({ agencies: 1, clients: 1 });
    expect(await dbs.owner.select().from(capture)).toEqual(before.c);
    expect(await dbs.owner.select().from(evidence)).toEqual(before.e);
  });

  it('dry-run writes nothing', async () => {
    await addUser('owner-b1');
    await dbs.service.insert(membership).values({ userId: 'owner-b1', agencyId: IDS.agencyB, clientId: IDS.clientB1, role: 'client_owner', createdBy: 't' });
    await audit(IDS.agencyA, 'admin-a');
    await audit(IDS.agencyB, 'owner-b1');
    await dbs.owner.update(agency).set({ archivedAt: daysAgo(91) }).where(eq(agency.id, IDS.agencyA));
    await dbs.owner.update(client).set({ archivedAt: daysAgo(91) }).where(eq(client.id, IDS.clientB1));

    expect(await purgeArchived(dbs.service, { olderThanDays: 90, dryRun: true, now: NOW })).toEqual({ agencies: 1, clients: 1, auditAnonymised: 2 });
    expect(await exists(agency, IDS.agencyA)).toBe(true);
    expect(await exists(client, IDS.clientB1)).toBe(true);
    expect(await auditUsers(IDS.agencyA)).toEqual(['admin-a']);
    expect(await auditUsers(IDS.agencyB)).toEqual(['owner-b1']);
    expect(await platformRows()).toHaveLength(0);
    // The real run reports the same counts.
    expect(await purgeArchived(dbs.service, { olderThanDays: 90, dryRun: false, now: NOW })).toEqual({ agencies: 1, clients: 1, auditAnonymised: 2 });
  });

  it('a failing audit insert never masks the original purge error (it is logged)', async () => {
    const original = new Error('purge query failed');
    const broken = {
      execute: async () => { throw original; },
      insert: () => ({ values: async () => { throw new Error('audit insert failed'); } }),
    } as unknown as Db;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(purgeArchived(broken, { olderThanDays: 90, dryRun: false, now: NOW })).rejects.toBe(original);
      expect(logged).toHaveBeenCalledWith('[purge] platform audit insert failed', 'audit insert failed');
    } finally {
      logged.mockRestore();
    }
  });

  it('refuses fewer than 30 days', async () => {
    await expect(purgeArchived(dbs.service, { olderThanDays: 29, dryRun: true, now: NOW })).rejects.toThrow(/30 days/);
  });
});
