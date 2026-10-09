import { agencyWebhook, invitation, notification, notificationPref, prospectReport, themeProposal } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createPackLoader, listOpenReviews, reviewQuestions } from '@cs/engine';
import { createMemoryStore } from '@cs/storage';
import { listInbox, monthStart, spendByClient } from '@cs/tools';
import { isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAds } from './ads';
import { seedAgency, USAGE_TARGET_USD } from './agency';
import { seedBriefs } from './briefs';
import { seedChanges } from './changes';
import { createSeedContext, type SeedContext } from './context';
import { seedPlatform } from './platform';
import { seedReviews } from './reviews';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedChanges(ctx);
  await seedAds(ctx);
  await seedReviews(ctx);
  await seedBriefs(ctx);
  await seedAgency(ctx);
  await seedPlatform(ctx);
});

describe('seedAgency', () => {
  it('puts Lone Star near its monthly cap this month', async () => {
    const spend = await spendByClient(dbs.owner, [ctx.ids.clients.loneStar, ctx.ids.clients.brazos], monthStart(new Date()));
    const ls = spend.get(ctx.ids.clients.loneStar)!;
    expect(ls).toBeCloseTo(USAGE_TARGET_USD.loneStar, 2);
    expect(spend.get(ctx.ids.clients.brazos)!).toBeCloseTo(USAGE_TARGET_USD.brazos, 2);
    expect(ls / 15).toBeGreaterThanOrEqual(0.8);
    expect(ls / 15).toBeLessThan(1);
    expect(spend.get(ctx.ids.clients.brazos)!).toBeGreaterThan(0);
  });

  it('gives the admin read and unread inbox items, and stores preferences', async () => {
    const items = await listInbox(dbs.owner, { userId: ctx.ids.users.admin.userId });
    expect(items.some((i) => i.readAt === null)).toBe(true);
    expect(items.some((i) => i.readAt !== null)).toBe(true);
    expect((await listInbox(dbs.owner, { userId: ctx.ids.users.ownerLoneStar.userId })).length).toBeGreaterThan(0);
    expect((await dbs.owner.select().from(notificationPref)).length).toBeGreaterThanOrEqual(2);
    expect((await dbs.owner.select().from(notification)).every((n) => n.channel === 'in_app' && n.status === 'sent')).toBe(true);
  });

  it('has one pending invitation, one webhook and both prospect reports', async () => {
    expect(await dbs.owner.select().from(invitation).where(isNull(invitation.acceptedAt))).toHaveLength(1);
    expect(await dbs.owner.select().from(agencyWebhook)).toHaveLength(1);
    const reports = await dbs.owner.select().from(prospectReport);
    expect(reports.map((r) => r.status)).toEqual(['ready', 'ready']);
    expect(reports.every((r) => (r.data?.businesses.length ?? 0) > 0)).toBe(true);
  });
});

describe('seedPlatform', () => {
  it('queues one pending theme proposal per vertical and keeps two recent decisions (deviation 1)', async () => {
    const rows = await dbs.owner.select().from(themeProposal);
    expect(rows.filter((r) => r.status === 'proposed').map((r) => r.verticalId).sort()).toEqual(['dental', 'hvac_plumbing']);
    expect(rows.filter((r) => r.status === 'approved' || r.status === 'rejected')).toHaveLength(2);
  });

  it('opens four decision reviews whose questions resolve against the packs', async () => {
    const open = await listOpenReviews(dbs.owner, 50);
    expect(open).toHaveLength(4);
    const packs = createPackLoader();
    for (const r of open) expect((await reviewQuestions({ db: dbs.owner, packs }, r.id)).map((q) => q.key)).toEqual(['meaningful', 'change_type']);
  });
});
