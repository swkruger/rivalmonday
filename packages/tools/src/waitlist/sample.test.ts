import { agency, agencyBilling, agencyOnboarding, contact, membership, platformSetting, runbook } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { ensureOperatorMembership, ensureSampleAgency, isSampleAgency, SAMPLE_AGENCY_NAME } from './sample';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const deps = { app: dbs.app, service: dbs.service } as ToolDeps;
const ensure = () => dbs.service.transaction((tx) => ensureSampleAgency(tx, deps, 'op'));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
});

describe('sample space', () => {
  it('ensureSampleAgency creates one agency once (two concurrent calls → one id)', async () => {
    const [a, b] = await Promise.all([ensure(), ensure()]);
    expect(a).toBe(b);
    expect(await ensure()).toBe(a);
    const agencies = await dbs.service.select().from(agency).where(eq(agency.name, SAMPLE_AGENCY_NAME));
    expect(agencies.map((x) => x.id)).toEqual([a]);
    const [setting] = await dbs.service.select().from(platformSetting).where(eq(platformSetting.key, 'sample_agency_id'));
    expect(setting).toMatchObject({ value: { agencyId: a }, updatedBy: 'op' });
    expect(await isSampleAgency(dbs.service, a)).toBe(true);
    expect(await isSampleAgency(dbs.service, IDS.agencyA)).toBe(false);
  });

  it('sample agency is an exempt pilot with no onboarding row', async () => {
    const id = await ensure();
    const [billing] = await dbs.service.select().from(agencyBilling).where(eq(agencyBilling.agencyId, id));
    expect(billing).toMatchObject({ state: 'pilot', seatCapExempt: true });
    expect(await dbs.service.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, id))).toHaveLength(0);
    expect(await dbs.service.select().from(runbook).where(and(eq(runbook.agencyId, id), eq(runbook.level, 'agency')))).toHaveLength(1);
    const [row] = await dbs.service.select().from(agency).where(eq(agency.id, id));
    expect(row!.branding).toBeNull();
  });

  it('membership created once for the operator with an agency contact', async () => {
    const id = await ensure();
    for (let i = 0; i < 2; i++) await dbs.service.transaction((tx) => ensureOperatorMembership(tx, id, 'op'));
    const ms = await dbs.service.select().from(membership).where(eq(membership.agencyId, id));
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ userId: 'op', role: 'agency_admin', clientId: null, createdBy: 'op' });
    const cs = await dbs.service.select().from(contact).where(eq(contact.agencyId, id));
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ id: ms[0]!.contactId, role: 'agency_admin', email: 'op@example.com', clientId: null });
  });

  it('reuses a stale agency contact for the operator', async () => {
    const id = await ensure();
    const [stale] = await dbs.service.insert(contact).values({ agencyId: id, role: 'agency_admin', email: 'OP@example.com', name: 'Old', active: false }).returning();
    await dbs.service.transaction((tx) => ensureOperatorMembership(tx, id, 'op'));
    const [m] = await dbs.service.select().from(membership).where(eq(membership.agencyId, id));
    expect(m!.contactId).toBe(stale!.id);
    const cs = await dbs.service.select().from(contact).where(eq(contact.agencyId, id));
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ active: true, userId: 'op' });
  });
});
