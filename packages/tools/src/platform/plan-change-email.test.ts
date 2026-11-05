import { describeTiers } from '@cs/billing';
import { DEFAULT_SUPPORT_EMAIL, type PlanFeature } from '@cs/core';
import { membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport, type PlanTerms } from '@cs/email';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { planChangeWorthEmailing, sendAgencyPlanChangeEmail } from './plan-change-email';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const A = IDS.agencyA;
const props = {
  before: { basePriceCents: 22900, basePriceYearCents: null, includedSeats: 3, seatTiers: [{ upTo: null, unitCents: 9900 }], tiers: [{ fromClient: 4, toClient: null, unitCents: 9900 }] },
  after: { basePriceCents: 22900, basePriceYearCents: 229000, includedSeats: 3, seatTiers: [{ upTo: 7, unitCents: 7900 }, { upTo: null, unitCents: 5900 }], tiers: describeTiers(3, [{ upTo: 7, unitCents: 7900 }, { upTo: null, unitCents: 5900 }]) },
  featuresAdded: [] as PlanFeature[],
  featuresRemoved: ['mcp'] as PlanFeature[],
  effective: { kind: 'next_billing' as const, date: '2026-11-03' },
};
let transport: ReturnType<typeof createMemoryTransport>;
const deps = (o: Partial<ToolDeps> = {}): ToolDeps => ({
  app: dbs.app, service: dbs.service,
  leadEmail: { transport, appUrl: 'https://app.test/', fromAddress: 'team@app.test', platformAdmins: [] },
  ...o,
});

beforeEach(async () => {
  vi.restoreAllMocks();
  transport = createMemoryTransport();
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'ann', 'Ann@Example.com');
  await seedUser(dbs.owner, 'bob', 'bob@example.com');
  await seedUser(dbs.owner, 'am', 'am@example.com');
  await dbs.owner.execute(sql`update auth."user" set name = 'Ann Admin' where id = 'ann'`);
  await dbs.service.insert(membership).values([
    { userId: 'ann', agencyId: A, role: 'agency_admin', createdBy: 'seed' },
    { userId: 'bob', agencyId: A, role: 'agency_admin', createdBy: 'seed' },
    { userId: 'am', agencyId: A, role: 'account_manager', createdBy: 'seed' },
  ]);
});

describe('sendAgencyPlanChangeEmail', () => {
  it('one email per distinct admin', async () => {
    expect(await sendAgencyPlanChangeEmail(deps(), A, props)).toBe(2);
    expect(transport.sent.map((m) => m.to).sort()).toEqual(['ann@example.com', 'bob@example.com']);
    for (const m of transport.sent) {
      expect(m).toMatchObject({ from: '"Rival Monday" <team@app.test>', replyTo: DEFAULT_SUPPORT_EMAIL, subject: 'Your Rival Monday plan is changing', tag: 'agency_plan_change' });
      expect(m.text).toContain('No longer included: MCP access.');
      // Price lines carry the graduated tiers.
      expect(m.text).toContain('$229/mo (or $2,290/yr) · 3 clients included · clients 4–10: $79 each · clients 11+: $59 each');
    }
    expect(transport.sent.find((m) => m.to === 'ann@example.com')!.text).toContain('Hi Ann,');
  });
  it('returns 0 without transport', async () => {
    expect(await sendAgencyPlanChangeEmail(deps({ leadEmail: null }), A, props)).toBe(0);
  });
  it('swallows transport errors', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = { kind: 'memory' as const, send: async () => { throw new Error('boom ann@example.com'); } };
    expect(await sendAgencyPlanChangeEmail(deps({ leadEmail: { transport: bad, appUrl: 'https://app.test/', fromAddress: 'team@app.test', platformAdmins: [] } }), A, props)).toBe(0);
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/@example\.com|boom/);
  });
});

describe('planChangeWorthEmailing', () => {
  const t = { basePriceCents: 22900, basePriceYearCents: 229000 as number | null, includedSeats: 3, seatTiers: [{ upTo: 7, unitCents: 7900 }, { upTo: null as number | null, unitCents: 5900 }], tiers: [] as PlanTerms['tiers'], features: ['ask', 'mcp'] as PlanFeature[] };
  it('false when nothing differs (feature order ignored)', () => {
    expect(planChangeWorthEmailing(t, { ...t, features: ['mcp', 'ask'] })).toBe(false);
  });
  it('true when any term differs', () => {
    expect(planChangeWorthEmailing(t, { ...t, basePriceCents: 1 })).toBe(true);
    expect(planChangeWorthEmailing(t, { ...t, includedSeats: 4 })).toBe(true);
    expect(planChangeWorthEmailing(t, { ...t, seatTiers: [t.seatTiers[0]!, { upTo: null, unitCents: 1 }] })).toBe(true);
    expect(planChangeWorthEmailing(t, { ...t, seatTiers: [{ upTo: 8, unitCents: 7900 }, t.seatTiers[1]!] })).toBe(true);
    expect(planChangeWorthEmailing(t, { ...t, seatTiers: [t.seatTiers[0]!, { upTo: 20, unitCents: 5900 }, { upTo: null, unitCents: 4900 }] })).toBe(true);
    expect(planChangeWorthEmailing(t, { ...t, basePriceYearCents: 199000 })).toBe(true);
    expect(planChangeWorthEmailing(t, { ...t, basePriceYearCents: null })).toBe(true);
  });
  it('true when the feature sets differ', () => {
    expect(planChangeWorthEmailing(t, { ...t, features: ['ask'] })).toBe(true);
  });
});
