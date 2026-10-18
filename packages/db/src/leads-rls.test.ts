import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { intakeLink, intakeRate, lead, leadPreviewSchema } from './schema';
import type { SetupLookup } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const lookup = (placeId: string): SetupLookup => ({
  placeId, cid: null, title: 'Acme Dental', address: null, city: null, category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 1, lng: 2,
});
const mk = (over: Partial<typeof lead.$inferInsert> = {}): typeof lead.$inferInsert => ({
  agencyId: IDS.agencyA, source: 'agency_link', contactName: 'Pat', email: 'pat@example.com', lookup: lookup('p1'), ...over,
});
const staff = (agencyId: string, role = 'agency_admin') => ({ agencyId, clientScope: 'all' as const, role: role as never });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(intakeLink).values([
    { agencyId: IDS.agencyA, slug: 'agency-a' },
    { agencyId: IDS.agencyB, slug: 'agency-b' },
  ]);
  await dbs.service.insert(lead).values([
    mk({ email: 'a@x.co' }),
    mk({ agencyId: IDS.agencyB, email: 'b@x.co' }),
    mk({ agencyId: null, source: 'platform', status: 'verified', email: 'pool@x.co' }),
  ]);
});

describe('lead / intake_link RLS', () => {
  it('agency A cannot read agency B leads', async () => {
    const a = await withTenant(dbs.app, staff(IDS.agencyA), (tx) => tx.select().from(lead));
    expect(a.map((r) => r.email)).toEqual(['a@x.co']);
    const links = await withTenant(dbs.app, staff(IDS.agencyA, 'account_manager'), (tx) => tx.select().from(intakeLink));
    expect(links.map((r) => r.slug)).toEqual(['agency-a']);
  });

  it('pool leads invisible to app_user', async () => {
    for (const agencyId of [IDS.agencyA, IDS.agencyB]) {
      const rows = await withTenant(dbs.app, staff(agencyId), (tx) => tx.select().from(lead));
      expect(rows.some((r) => r.agencyId === null)).toBe(false);
    }
    expect((await dbs.service.select().from(lead)).filter((r) => r.agencyId === null)).toHaveLength(1);
  });

  it('client roles see no leads or intake_link', async () => {
    const scope = { agencyId: IDS.agencyA, clientScope: [IDS.clientA1], role: 'client_owner' as never };
    expect(await withTenant(dbs.app, scope, (tx) => tx.select().from(lead))).toEqual([]);
    expect(await withTenant(dbs.app, scope, (tx) => tx.select().from(intakeLink))).toEqual([]);
    const none = { agencyId: IDS.agencyA, clientScope: 'all' as const };
    expect(await withTenant(dbs.app, none, (tx) => tx.select().from(lead))).toEqual([]);
  });

  it('app_user cannot write lead/intake_link/intake_rate', async () => {
    const scope = staff(IDS.agencyA);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(lead).values(mk({ email: 'n@x.co' }))))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.update(lead).set({ status: 'declined' })))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.delete(lead)))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(intakeLink).values({ agencyId: IDS.agencyA, slug: 'zzz' })))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.update(intakeLink).set({ enabled: false })))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(intakeRate).values({ key: 'k', windowStart: new Date() })))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.select().from(intakeRate)))).toMatch(/permission denied/);
  });
});

describe('lead constraints', () => {
  it("slug check rejects 'A-b', '-ab', 'ab-'", async () => {
    for (const slug of ['A-b', '-ab', 'ab-', 'a']) {
      await dbs.service.delete(intakeLink).where(sql`agency_id = ${IDS.agencyA}`);
      expect(await errorText(dbs.service.insert(intakeLink).values({ agencyId: IDS.agencyA, slug }))).toMatch(/intake_link_slug_check/);
    }
    await dbs.service.insert(intakeLink).values({ agencyId: IDS.agencyA, slug: 'a-b' });
  });

  it('dedupe index blocks a second open lead for same agency/email/place but allows after accepted', async () => {
    expect(await errorText(dbs.service.insert(lead).values(mk({ email: 'A@X.co' })))).toMatch(/lead_dedupe_idx/);
    // pool leads dedupe too (null agency coalesced)
    expect(await errorText(dbs.service.insert(lead).values(mk({ agencyId: null, source: 'platform', email: 'POOL@x.co' })))).toMatch(/lead_dedupe_idx/);
    // different place or agency is fine
    await dbs.service.insert(lead).values(mk({ email: 'a@x.co', lookup: lookup('p2') }));
    await dbs.service.insert(lead).values(mk({ agencyId: IDS.agencyB, email: 'a@x.co' }));
    await dbs.service.update(lead).set({ status: 'accepted' }).where(sql`email = 'a@x.co' AND agency_id = ${IDS.agencyA} AND lookup->>'placeId' = 'p1'`);
    await dbs.service.insert(lead).values(mk({ email: 'a@x.co' }));
  });

  it('assigned_by/decided_by accept a non-uuid user id', async () => {
    const [r] = await dbs.service.insert(lead).values(mk({ email: 'u@x.co', assignedBy: 'Zx9_not-a-uuid', decidedBy: 'Zx9_not-a-uuid' })).returning();
    expect([r!.assignedBy, r!.decidedBy]).toEqual(['Zx9_not-a-uuid', 'Zx9_not-a-uuid']);
  });

  it('defaults and column limits; intake_rate counter row', async () => {
    const [r] = await dbs.service.select().from(lead).where(sql`email = 'a@x.co'`);
    expect([r!.status, r!.preview, r!.confirmationSentAt, r!.poolNotifiedAt]).toEqual(['unverified', { status: 'none' }, null, null]);
    expect(await errorText(dbs.service.insert(lead).values(mk({ email: 'm@x.co', message: 'x'.repeat(501) })))).toMatch(/lead_message_check/);
    expect(await errorText(dbs.service.insert(lead).values(mk({ email: 's@x.co', source: 'x' as never })))).toMatch(/lead_source_check/);
    await dbs.service.insert(intakeRate).values({ key: 'ip:abc', windowStart: new Date('2026-10-17T00:00:00Z') });
    const [c] = await dbs.service.select().from(intakeRate);
    expect(c!.count).toBe(0);
  });
});

describe('leadPreviewSchema', () => {
  it('parses none/pending/failed and ready; rejects more than 5 nearby', () => {
    expect(leadPreviewSchema.parse({ status: 'none' })).toEqual({ status: 'none' });
    const biz = { name: 'B', rating: null, votes: null };
    const ready = { status: 'ready', self: biz, nearby: [{ ...biz, distanceKm: 1.2 }], facts: ['f'], summary: null, category: 'Dentist', generatedAt: '2026-10-17T00:00:00Z' };
    expect(leadPreviewSchema.parse(ready).status).toBe('ready');
    expect(leadPreviewSchema.safeParse({ ...ready, nearby: Array(6).fill({ ...biz, distanceKm: 1 }) }).success).toBe(false);
  });
});
