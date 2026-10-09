import { agencyWebhook, competitorSuggestion, contact, llmCall, notification, notificationPref, playbookOverride, prospectReport, type ProspectReportData, vendorCall } from '@cs/db';
import { createInvitation } from '@cs/tools';
import { eq } from 'drizzle-orm';
import type { SeedContext } from './context';
import { FILLER_BUSINESSES } from './rankings';
import { CLIENT_SPECS } from './tenancy';
import { DEMO_DOMAIN } from './users';

/** Spec §4.8: Lone Star sits near its $15 cap (warning at 80 %). */
export const USAGE_TARGET_USD = { loneStar: 13.1, brazos: 3.25, agency: 1.8 } as const;

/** A time this month: `hours` before now, but never before the 1st (UTC) — usage is per calendar month. */
const inMonth = (ctx: SeedContext, hours: number) => new Date(Math.max(ctx.clock.monthStart.getTime() + 60_000, ctx.clock.now.getTime() - hours * 3_600_000));

async function seedUsage(ctx: SeedContext): Promise<void> {
  const { db, ids } = ctx;
  const llm = (clientId: string | null, task: string, cost: number, h: number) => ({ agencyId: ids.agencyId, clientId, task, provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6', inputTokens: 4000, outputTokens: 900, costUsd: cost, latencyMs: 2100, ok: true, createdAt: inMonth(ctx, h) });
  const vendor = (clientId: string | null, operation: string, cost: number, h: number) => ({ agencyId: ids.agencyId, clientId, vendor: 'dataforseo', operation, units: 1, costUsd: cost, latencyMs: 900, ok: true, createdAt: inMonth(ctx, h) });
  const ls = ids.clients.loneStar;
  const bz = ids.clients.brazos;
  // Lone Star: 9.40 + 3.70 = 13.10. Brazos: 2.00 + 1.25 = 3.25. Agency-level: 1.80.
  await db.insert(llmCall).values([llm(ls, 'brief_writer', 4.2, 30), llm(ls, 'review_decisions', 2.7, 20), llm(ls, 'tag_decisions', 2.5, 10), llm(bz, 'brief_writer', 2.0, 12), llm(null, 'theme_discovery', 1.8, 5)]);
  await db.insert(vendorCall).values([vendor(ls, 'local_finder', 2.2, 26), vendor(ls, 'reviews', 1.5, 16), vendor(bz, 'local_finder', 1.25, 8)]);
}

async function seedNotifications(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const ls = ids.clients.loneStar;
  const bz = ids.clients.brazos;
  const row = (contactId: string, clientId: string, kind: string, subjectType: string, subjectId: string, title: string, body: string, link: string, hours: number, read: boolean) => {
    const at = clock.daysAgo(hours / 24);
    return {
      agencyId: ids.agencyId, clientId, contactId, channel: 'in_app', kind, subjectType, subjectId, dedupeKey: `demo:${kind}:${subjectId}:${contactId}`, title, body, link,
      status: 'sent', notBefore: at, sentAt: at, readAt: read ? new Date(at.getTime() + 3_600_000) : null, createdAt: at,
    };
  };
  const admin = ids.users.admin.contactId;
  await db.insert(notification).values([
    row(admin, ls, 'am_alert', 'alert', ids.alerts.pending, 'Alert waiting for review', 'An alert for Lone Star Cooling needs your check.', '/agency/alerts', 20, false),
    row(admin, ls, 'brief_ready', 'brief', ids.briefs.readyLoneStar, 'Brief ready for approval', 'Lone Star Cooling’s brief for next Monday is ready.', `/agency/approvals/${ids.briefs.readyLoneStar}`, 6, false),
    row(admin, ls, 'trend_report', 'trend_report', ids.reportId, 'Quarterly trend report sent', 'Lone Star Cooling’s quarterly report went out.', `/c/${ls}/reports/${ids.reportId}`, 24 * 9, true),
    row(ids.users.ownerLoneStar.contactId, ls, 'alert', 'alert', ids.alerts.delivered, 'New competitor alert', 'A competitor changed its prices.', `/c/${ls}/alerts/${ids.alerts.delivered}`, 40, true),
    row(ids.users.ownerLoneStar.contactId, ls, 'brief', 'brief', ids.briefs.sentLoneStar[0]!, 'Your Monday brief', 'This week’s competitor brief is ready.', `/c/${ls}/briefs/${ids.briefs.sentLoneStar[0]!}`, 30, false),
    row(ids.users.ownerBrazos.contactId, bz, 'brief', 'brief', ids.briefs.sentBrazos[0]!, 'Your Monday brief', 'This week’s competitor brief is ready.', `/c/${bz}/briefs/${ids.briefs.sentBrazos[0]!}`, 30, false),
  ]);
  await db.insert(notificationPref).values([
    { contactId: admin, agencyId: ids.agencyId, kind: 'brief_ready', channel: 'email', enabled: false },
    { contactId: ids.users.ownerLoneStar.contactId, agencyId: ids.agencyId, kind: 'alert_digest', channel: 'in_app', enabled: false },
  ]);
  await db.update(contact).set({ quietHours: { start: '21:00', end: '07:00' }, timezone: 'America/Chicago' }).where(eq(contact.id, ids.users.ownerLoneStar.contactId));
}

function prospectData(ctx: SeedContext, keywords: string[], businesses: ProspectReportData['businesses']): ProspectReportData {
  return { generatedAt: ctx.clock.now.toISOString(), keywords, points: 9, scanId: null, businesses, notes: ['Demo data: no vendor calls were made for this snapshot.'] };
}

async function seedProspects(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const rng = ctx.rng('prospects');
  const ranks = (keywords: string[]) => keywords.map((keyword) => ({ keyword, found: rng.int(4, 9), top3: rng.int(0, 5), averageRank: Math.round(rng.between(2, 9) * 10) / 10 }));
  const lakeKw = CLIENT_SPECS.lakeside.keywords;
  await db.insert(prospectReport).values({
    agencyId: ids.agencyId, clientId: ids.clients.lakeside, status: 'ready', createdAt: clock.daysAgo(2), finishedAt: clock.daysAgo(2),
    data: prospectData(ctx, lakeKw, ids.competitors.lakeside.map((c, i) => ({
      competitorId: c.id, name: c.name, self: false, gbp: { rating: [4.6, 4.3][i] ?? 4.5, reviews: [210, 95][i] ?? 50, category: 'Dentist', extraCategories: 1 }, ads: { google: i, meta: null }, ranks: ranks(lakeKw),
    }))),
  });
  // The pitch snapshot Lone Star was converted from (5c-1 "pitch snapshot after conversion").
  const lsKw = CLIENT_SPECS.loneStar.keywords;
  await db.insert(prospectReport).values({
    agencyId: ids.agencyId, clientId: ids.clients.loneStar, status: 'ready', createdAt: clock.daysAgo(395), finishedAt: clock.daysAgo(395),
    data: prospectData(ctx, lsKw, [
      { competitorId: ids.selfLoneStar, name: 'Lone Star Cooling', self: true, gbp: { rating: 4.6, reviews: 88, category: 'HVAC contractor', extraCategories: 2 }, ads: { google: null, meta: null }, ranks: ranks(lsKw) },
      ...ids.competitors.loneStar.slice(0, 3).map((c) => ({ competitorId: c.id, name: c.name, self: false, gbp: { rating: 4.3, reviews: 120, category: 'HVAC contractor', extraCategories: 1 }, ads: { google: 2, meta: 1 }, ranks: ranks(lsKw) })),
    ]),
  });
}

/** Spec §4.1 team extras, §4.8 usage and playbooks, and the inbox and preferences. */
export async function seedAgency(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  await seedUsage(ctx);
  await db.insert(playbookOverride).values({
    agencyId: ids.agencyId, verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: 'Answer a price cut with a comfort bundle',
    template: '{{competitor}} cut {{service}} to {{new_price}}. Keep your price and bundle {{service}} with a free filter and priority scheduling for Hood County members.',
    updatedBy: ids.users.admin.userId, updatedAt: clock.daysAgo(14),
  });
  await seedNotifications(ctx);
  await db.insert(agencyWebhook).values({
    agencyId: ids.agencyId, kind: 'slack', url: 'https://hooks.slack.com/services/TDEMO0000/BDEMO0000/demo-not-a-real-hook', kinds: ['am_alert', 'brief_ready'],
    active: true, createdBy: ids.users.admin.userId, createdAt: clock.daysAgo(200),
  });
  await createInvitation(db, { agencyId: ids.agencyId, email: `newhire@${DEMO_DOMAIN}`, role: 'account_manager', invitedBy: ids.users.admin.userId }, clock.daysAgo(2));
  await db.insert(competitorSuggestion).values(FILLER_BUSINESSES.slice(0, 2).map((name, i) => ({
    agencyId: ids.agencyId, clientId: ids.clients.loneStar, name, domain: null, placeId: `demo-filler-${i}`, cid: null, rating: [4.5, 4.1][i]!, votes: [88, 41][i]!,
    appearances: [5, 3][i]!, bestRank: [4, 7][i]!, overlapScore: [0.62, 0.41][i]!, status: 'suggested', createdAt: clock.daysAgo(6),
  })));
  await seedProspects(ctx);
}
