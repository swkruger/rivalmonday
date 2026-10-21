import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AccessContext, createAccessContext, GLOSSARY } from '@cs/core';
import { kbArticle } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { isNotNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';
import { ctx, dbs, registry, resetWorkspace } from '../tools/workspace-fixtures';
import { seedKnowledge } from './seed';

/**
 * 15b-1 pilot content: `seedKnowledge` over the real `docs/help` folder and the real `GLOSSARY` (the `pnpm kb:seed` path),
 * then the help tools read it back per audience. Guards the owner-facing copy against validation errors and audience leaks.
 */
const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../../../docs/help');
const PILOT = ['page:client.changes#agency', 'page:client.changes#client', 'page:client.overview#agency', 'page:client.overview#client', 'page:client.reviews#agency', 'page:client.reviews#client'];
/** 15b-2 Task 4, client batch A: agency and client versions where the content differs, one `all` guide where it does not. */
const BATCH_A_SPLIT = ['page:client.competitors', 'page:client.competitors.detail', 'page:client.rankings'];
const BATCH_A_ALL = ['page:client.ads', 'page:client.moves', 'page:client.pricing'];
const BATCH_A = [...BATCH_A_SPLIT.flatMap((k) => [`${k}#agency`, `${k}#client`]), ...BATCH_A_ALL.map((k) => `${k}#all`)];
/** 15b-2 Task 5, client batch B. Pitch snapshot is agency-only (a client role gets a 404), so it has an agency guide and no client guide. */
const BATCH_B_SPLIT = ['page:client.recommendations', 'page:client.ask', 'page:client.briefs', 'page:client.briefs.detail', 'page:client.alerts.detail'];
const BATCH_B_ALL = ['page:client.ask.thread', 'page:client.reports.detail', 'page:client.evidence.detail'];
const AGENCY_ONLY_PAGES = ['page:client.pitch-snapshot'];
const BATCH_B = [...BATCH_B_SPLIT.flatMap((k) => [`${k}#agency`, `${k}#client`]), ...BATCH_B_ALL.map((k) => `${k}#all`), ...AGENCY_ONLY_PAGES.map((k) => `${k}#agency`)];
/**
 * 15b-2 Task 6, client batch C. Delivery and Runbook are agency-only (a client role gets a 404): agency guide only.
 * Billing is client-owner-only (an agency role gets a 404): client guide only.
 */
const BATCH_C_SPLIT = ['page:client.setup', 'page:client.settings.profile', 'page:client.settings.alerts', 'page:client.settings.ai'];
const BATCH_C_AGENCY_ONLY = ['page:client.settings.delivery', 'page:client.settings.runbook'];
const BATCH_C_CLIENT_ONLY = ['page:client.settings.billing'];
const BATCH_C = [...BATCH_C_SPLIT.flatMap((k) => [`${k}#agency`, `${k}#client`]), ...BATCH_C_AGENCY_ONLY.map((k) => `${k}#agency`), ...BATCH_C_CLIENT_ONLY.map((k) => `${k}#client`)];
/** 15b-2 Task 7, agency batch A: every page is reachable by agency roles only, so each has one `agency` guide and no client version. */
const AGENCY_A = ['page:agency.portfolio', 'page:agency.clients.new', 'page:agency.approvals', 'page:agency.approvals.detail', 'page:agency.alerts', 'page:agency.prospects', 'page:agency.prospects.new', 'page:agency.prospects.detail', 'page:agency.leads'];
/** 15b-2 Task 8, agency batch B: the agency settings pages. All reachable by agency roles only, so each has one `agency` guide. */
const AGENCY_B = ['page:agency.settings.ai', 'page:agency.settings.billing', 'page:agency.settings.branding', 'page:agency.settings.intake', 'page:agency.settings.platform-access', 'page:agency.settings.runbook', 'page:agency.settings.slack-teams', 'page:agency.settings.team', 'page:agency.settings.usage'];
/**
 * 15b-2 Task 9a, platform pages: operator-only (`requireOperatorContext`), so every page has one `operator` guide and nothing else.
 * Themes is the Topic proposals page (key unchanged, text says "topic").
 */
const PLATFORM_KEYS = [
  'overview', 'agencies', 'agencies.detail', 'billing', 'leads', 'reviews', 'themes', 'ask', 'ask.thread', 'knowledge', 'knowledge.new', 'knowledge.detail', 'health', 'costs', 'verticals', 'runbook',
].map((k) => `page:platform.${k}`).sort();
/**
 * 15b-2 Task 9b, account pages: listed in every context (`page:account.%`, `list_help_guides`) and audience-filtered. Inbox and Notification
 * settings are reached by agency roles and client roles (inbox also by guests), so each has an agency and a client version; the
 * agency setup wizard is agency-admin only, so it has an agency guide and no client guide.
 */
const ACCOUNT_SPLIT = ['page:account.inbox', 'page:account.settings.notifications'];
const ACCOUNT_AGENCY_ONLY = ['page:account.onboarding'];
const ACCOUNT_SEEDS = [...ACCOUNT_SPLIT.flatMap((k) => [`${k}#agency`, `${k}#client`]), ...ACCOUNT_AGENCY_ONLY.map((k) => `${k}#agency`)];
/** What an agency role / a client role reads of the account guides, in any context. */
const ACCOUNT_AGENCY_ROLE = [...ACCOUNT_SPLIT, ...ACCOUNT_AGENCY_ONLY].sort();
const ACCOUNT_CLIENT_ROLE = [...ACCOUNT_SPLIT].sort();
const AGENCY_KEYS = [...AGENCY_A, ...AGENCY_B].sort();
const CLIENT_PAGES = [...PILOT, ...BATCH_A, ...BATCH_B, ...BATCH_C, ...AGENCY_KEYS.map((k) => `${k}#agency`)].sort();
const CLIENT_KEYS = [...new Set(CLIENT_PAGES.map((k) => k.split('#')[0]!))].filter((k) => !AGENCY_KEYS.includes(k)).sort();
/** What a client role can read: every client page guide except the agency-only pages. */
const CLIENT_ROLE_KEYS = CLIENT_KEYS.filter((k) => !AGENCY_ONLY_PAGES.includes(k) && !BATCH_C_AGENCY_ONLY.includes(k));
/** What an agency role can read: every client page guide except the client-owner-only pages (Billing). */
const AGENCY_ROLE_KEYS = CLIENT_KEYS.filter((k) => !BATCH_C_CLIENT_ONLY.includes(k));
/**
 * Words a client must never read in help: agency-internal concepts and the product name (client-facing text falls back to
 * "your agency"). The default assistant name is fine once rendered (it is what an un-renamed assistant is called); the
 * seed lint keeps it out of the source text.
 */
const AGENCY_ONLY = /\brout(e|ed|ing)\b|upsell|\bseats?\b|AM check|place id|prospect|pitch|approval|rival\s*monday/i;

type Guide = { id: string; title: string; sections: { heading: string; markdown: string }[] } | null;
const owner = ctx('client_owner', [IDS.clientA1]);
const viewer = ctx('client_viewer', [IDS.clientA1]);
const admin = ctx('agency_admin', 'all');
const am = ctx('account_manager', [IDS.clientA1]);
/** A platform operator: `op@example.com` is in the registry's platform admin list (an agency admin of agency A by role). */
const opRegistry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });
const op = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [] });
const guide = (c: AccessContext, helpKey: string) => registry.invoke(c, 'get_page_guide', { helpKey, context: 'client', clientId: IDS.clientA1 }) as Promise<Guide>;
const text = (g: Guide) => (g ? [g.title, ...g.sections.flatMap((s) => [s.heading, s.markdown])].join('\n') : '');

beforeEach(async () => {
  await resetWorkspace();
  await truncateAuth(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
  await seedKnowledge(dbs.service, DOCS, 'system:seed', { glossary: GLOSSARY });
});

describe('help content (real docs/help + GLOSSARY)', () => {
  it('seeds with no validation errors: the pilot guides and one row per glossary term', async () => {
    const rows = await dbs.service.select({ seedKey: kbArticle.seedKey, helpKey: kbArticle.helpKey, audience: kbArticle.audience, clientVisible: kbArticle.clientVisible })
      .from(kbArticle).where(isNotNull(kbArticle.helpKey));
    const keys = rows.map((r) => r.seedKey!);
    expect(keys.filter((k) => k.startsWith('page:')).sort()).toEqual([...CLIENT_PAGES, ...ACCOUNT_SEEDS, ...PLATFORM_KEYS.map((k) => `${k}#operator`)].sort());
    expect(keys.filter((k) => k.startsWith('glossary:')).sort()).toEqual(GLOSSARY.map((t) => `glossary:${t.id}#${t.audience}`).sort());
    for (const r of rows) expect(r.clientVisible, r.seedKey!).toBe(r.audience === 'all' || r.audience === 'client');
    // A second run changes nothing.
    expect(await seedKnowledge(dbs.service, DOCS, 'system:seed', { glossary: GLOSSARY })).toMatchObject({ created: 0, updated: 0, removed: 0 });
  });

  it('client roles get the client version, agency roles the agency version', async () => {
    for (const key of ['page:client.overview', 'page:client.changes', 'page:client.reviews']) {
      const [o, v, a, m] = await Promise.all([guide(owner, key), guide(viewer, key), guide(admin, key), guide(am, key)]);
      expect(o!.id, key).toBe(v!.id);
      expect(a!.id, key).toBe(m!.id);
      expect(a!.id, key).not.toBe(o!.id);
    }
    const [o, a] = await Promise.all([guide(owner, 'page:client.reviews'), guide(admin, 'page:client.reviews')]);
    for (const g of [o, a]) expect(g!.sections.map((s) => s.heading)).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
  });

  it('list_help_guides gives agency roles every client page guide but Billing and client roles all but the agency-only pages (pilot, batches A, B and C)', async () => {
    for (const [c, keys] of [[owner, [...CLIENT_ROLE_KEYS, ...ACCOUNT_CLIENT_ROLE].sort()], [viewer, [...CLIENT_ROLE_KEYS, ...ACCOUNT_CLIENT_ROLE].sort()], [admin, [...AGENCY_ROLE_KEYS, ...ACCOUNT_AGENCY_ROLE].sort()], [am, [...AGENCY_ROLE_KEYS, ...ACCOUNT_AGENCY_ROLE].sort()]] as const) {
      const { guides } = (await registry.invoke(c, 'list_help_guides', { context: 'client', clientId: IDS.clientA1 })) as { guides: { helpKey: string }[] };
      expect(guides.map((g) => g.helpKey).sort(), c.role).toEqual(keys);
    }
  });

  it('batch A: split pages give each audience its own guide, the rest share one `all` guide with the three standard sections', async () => {
    for (const key of BATCH_A_SPLIT) {
      const [o, v, a, m] = await Promise.all([guide(owner, key), guide(viewer, key), guide(admin, key), guide(am, key)]);
      expect(o!.id, key).toBe(v!.id);
      expect(a!.id, key).toBe(m!.id);
      expect(a!.id, key).not.toBe(o!.id);
    }
    for (const key of BATCH_A_ALL) {
      const [o, a] = await Promise.all([guide(owner, key), guide(admin, key)]);
      expect(o!.id, key).toBe(a!.id);
    }
    for (const key of BATCH_A_SPLIT.concat(BATCH_A_ALL)) {
      for (const c of [owner, admin]) expect((await guide(c, key))!.sections.map((s) => s.heading), key).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
    }
  });

  it('batch A: the agency versions carry the agency-only content, the client versions leave it out', async () => {
    const rankA = text(await guide(admin, 'page:client.rankings'));
    for (const w of ['Rank settings', 'Scan now', 'once every 7 days', '10 manual scans a day', 'Sunday', 'monthly cost cap']) expect(rankA, w).toContain(w);
    const rankC = text(await guide(owner, 'page:client.rankings'));
    expect(rankC).not.toMatch(/Scan now|Rank settings|manual scan|7 days|cost cap|UTC|Sunday/i);
    expect(rankC).toContain('counts as 21');
    const compA = text(await guide(admin, 'page:client.competitors'));
    for (const w of ['Suggested competitors', 'Find competitors', 'one manual search per week', 'Track selected']) expect(compA, w).toContain(w);
    const compC = text(await guide(owner, 'page:client.competitors'));
    expect(compC).not.toMatch(/Suggested competitors|Find competitors|manual search|Track selected|Dismiss|Business profile/i);
    for (const t of ['Top rival', 'Worth watching', 'Minor']) expect(compC, t).toContain(t);
    const detA = text(await guide(admin, 'page:client.competitors.detail'));
    for (const w of ['Ad accounts', 'pinned page is checked daily', 'Add page']) expect(detA, w).toContain(w);
    const detC = text(await guide(owner, 'page:client.competitors.detail'));
    expect(detC).not.toMatch(/Ad accounts|pinned|Add page|Data provider/i);
    expect(text(await guide(owner, 'page:client.moves'))).toContain('Emerging');
    expect(text(await guide(owner, 'page:client.pricing'))).toContain('Your service');
    expect(text(await guide(owner, 'page:client.ads'))).toContain('Targeting not disclosed (US)');
  });

  it('batch B: split pages give each audience its own guide, the rest share one `all` guide, all with the three standard sections', async () => {
    for (const key of BATCH_B_SPLIT) {
      const [o, v, a, m] = await Promise.all([guide(owner, key), guide(viewer, key), guide(admin, key), guide(am, key)]);
      expect(o!.id, key).toBe(v!.id);
      expect(a!.id, key).toBe(m!.id);
      expect(a!.id, key).not.toBe(o!.id);
    }
    for (const key of BATCH_B_ALL) {
      const [o, a] = await Promise.all([guide(owner, key), guide(admin, key)]);
      expect(o!.id, key).toBe(a!.id);
    }
    for (const key of [...BATCH_B_SPLIT, ...BATCH_B_ALL]) {
      for (const c of [owner, admin]) expect((await guide(c, key))!.sections.map((s) => s.heading), key).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
    }
  });

  it('batch B: pitch snapshot has an agency guide and no client guide', async () => {
    const key = 'page:client.pitch-snapshot';
    expect((await guide(admin, key))!.sections.map((s) => s.heading)).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
    expect(await guide(am, key)).not.toBeNull();
    expect(await guide(owner, key)).toBeNull();
    expect(await guide(viewer, key)).toBeNull();
  });

  it('batch B: the agency versions carry the agency-only content, the client versions leave it out', async () => {
    const recA = text(await guide(admin, 'page:client.recommendations'));
    for (const w of ['Upsell', 'From a detected move', 'Reopen', 'manage permission']) expect(recA, w).toContain(w);
    const recC = text(await guide(owner, 'page:client.recommendations'));
    expect(recC).not.toMatch(/upsell|runbook|manage permission/i);
    for (const w of ['To do', 'In progress', 'Effort', 'For you']) expect(recC, w).toContain(w);
    const askA = text(await guide(admin, 'page:client.ask'));
    for (const w of ['Allow review to improve answers', 'our support team', 'Assistant name']) expect(askA, w).toContain(w);
    const askC = text(await guide(owner, 'page:client.ask'));
    expect(askC).not.toMatch(/Allow review|Client features|quota|allowance|Assistant name|support session/i);
    expect(askC).toContain('Possible reason:');
    const briefsA = text(await guide(admin, 'page:client.briefs'));
    for (const w of ['Thursday night', 'Auto-send', 'Needs review', 'overdue']) expect(briefsA, w).toContain(w);
    const briefsC = text(await guide(owner, 'page:client.briefs'));
    expect(briefsC).not.toMatch(/Thursday|Auto-send|Needs review|overdue|status chip/i);
    expect(briefsC).toContain('Monday morning');
    const briefA = text(await guide(admin, 'page:client.briefs.detail'));
    for (const w of ['Upsell', '85%', 'Open in approvals']) expect(briefA, w).toContain(w);
    const briefC = text(await guide(owner, 'page:client.briefs.detail'));
    expect(briefC).not.toMatch(/0\.85|85\s*%|threshold|upsell|Open in approvals/i);
    for (const w of ['High confidence', 'Where you stand', 'First moves still open']) expect(briefC, w).toContain(w);
    const alertA = text(await guide(admin, 'page:client.alerts.detail'));
    for (const w of ['Score', 'Template text', 'Alert review', '3 instant alerts']) expect(alertA, w).toContain(w);
    const alertC = text(await guide(owner, 'page:client.alerts.detail'));
    expect(alertC).not.toMatch(/score|template text|3 instant|alert level|alert review/i);
    expect(text(await guide(owner, 'page:client.reports.detail'))).toContain('first week after each quarter ends');
    const ev = text(await guide(owner, 'page:client.evidence.detail'));
    for (const w of ['captured automatically by our monitoring service', 'changing even one character gives a completely different one']) expect(ev, w).toContain(w);
    expect(text(await guide(admin, 'page:client.pitch-snapshot'))).toContain('not in the top 20 at any of 9 points');
  });

  it('batch C: split pages give each audience its own guide, all with the three standard sections', async () => {
    for (const key of BATCH_C_SPLIT) {
      const [o, v, a, m] = await Promise.all([guide(owner, key), guide(viewer, key), guide(admin, key), guide(am, key)]);
      expect(o!.id, key).toBe(v!.id);
      expect(a!.id, key).toBe(m!.id);
      expect(a!.id, key).not.toBe(o!.id);
    }
    for (const key of [...BATCH_C_SPLIT, ...BATCH_C_AGENCY_ONLY]) expect((await guide(admin, key))!.sections.map((s) => s.heading), key).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
    for (const key of [...BATCH_C_SPLIT, ...BATCH_C_CLIENT_ONLY]) expect((await guide(owner, key))!.sections.map((s) => s.heading), key).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
  });

  it('batch C: Delivery and Runbook have an agency guide and no client guide; Billing has a client guide and no agency guide', async () => {
    for (const key of BATCH_C_AGENCY_ONLY) {
      expect(await guide(admin, key), key).not.toBeNull();
      expect(await guide(am, key), key).not.toBeNull();
      expect(await guide(owner, key), key).toBeNull();
      expect(await guide(viewer, key), key).toBeNull();
    }
    for (const key of BATCH_C_CLIENT_ONLY) {
      expect(await guide(owner, key), key).not.toBeNull();
      expect(await guide(viewer, key), key).not.toBeNull();
      expect(await guide(admin, key), key).toBeNull();
      expect(await guide(am, key), key).toBeNull();
    }
  });

  it('batch C: the agency versions carry the agency-only content, the client versions leave it out', async () => {
    const setupA = text(await guide(admin, 'page:client.setup'));
    for (const w of ['Invite the owner', 'Billing', 'Google place id', 'Dismiss setup', '48-hour', '14 days']) expect(setupA, w).toContain(w);
    const setupC = text(await guide(owner, 'page:client.setup'));
    expect(setupC).not.toMatch(/Invite the owner|Billing|Dismiss setup|place id|prospect/i);
    for (const w of ['Advanced', '48 hours', '14 days', 'Pick competitors']) expect(setupC, w).toContain(w);
    const profA = text(await guide(admin, 'page:client.settings.profile'));
    for (const w of ['Client features', 'Allow review to improve answers', 'Medium pressure', '0 ZIP codes']) expect(profA, w).toContain(w);
    const profC = text(await guide(owner, 'page:client.settings.profile'));
    expect(profC).not.toMatch(/Client features|Allow review|account manager/i);
    for (const w of ['Medium pressure', '0 ZIP codes', 'Quiet']) expect(profC, w).toContain(w);
    const del = text(await guide(admin, 'page:client.settings.delivery'));
    for (const w of ['I review alerts first', '17:00', 'Monday from 07:00', '3 instant alerts']) expect(del, w).toContain(w);
    const alertsA = text(await guide(admin, 'page:client.settings.alerts'));
    for (const w of ['3 instant alerts', '17:00', 'Delivery']) expect(alertsA, w).toContain(w);
    const alertsC = text(await guide(owner, 'page:client.settings.alerts'));
    expect(alertsC).not.toMatch(/3 instant|17:00|digest|Delivery|review alerts first/i);
    const aiA = text(await guide(admin, 'page:client.settings.ai'));
    for (const w of ['Agency settings › AI connections', 'Read, feedback and manage']) expect(aiA, w).toContain(w);
    const aiC = text(await guide(owner, 'page:client.settings.ai'));
    expect(aiC).not.toMatch(/manage|Agency settings/i);
    for (const w of ['Read only', 'Read and feedback', 'shown once']) expect(aiC, w).toContain(w);
    const bill = text(await guide(owner, 'page:client.settings.billing'));
    for (const w of ['Your plan with', 'Payment needed', 'Awaiting payment setup', 'Manage payment']) expect(bill, w).toContain(w);
    expect(bill).not.toMatch(/stripe|platform|seats?|\$\d/i);
    const rb = text(await guide(admin, 'page:client.settings.runbook'));
    for (const w of ['Update available', 'Use the update', 'Keep mine', 'Customised', 'Create a runbook for this client']) expect(rb, w).toContain(w);
  });

  it('nothing a client reads names agency-internal concepts or the product, and every placeholder is filled', async () => {
    for (const key of CLIENT_ROLE_KEYS) {
      const t = text(await guide(owner, key));
      expect(t, key).not.toMatch(AGENCY_ONLY);
      expect(t, key).not.toContain('{{');
    }
    for (const t of GLOSSARY.filter((x) => x.audience === 'all' || x.audience === 'client')) expect(`${t.term}\n${t.short}\n${t.long ?? ''}`, t.id).not.toMatch(AGENCY_ONLY);
  });

  it('agency batches A and B: agency roles read the eighteen guides in the agency context, with the three standard sections; client roles read none', async () => {
    const list = (c: AccessContext) => registry.invoke(c, 'list_help_guides', { context: 'agency' }) as Promise<{ guides: { helpKey: string }[] }>;
    const agencyGuide = (c: AccessContext, helpKey: string) => registry.invoke(c, 'get_page_guide', { helpKey, context: 'agency' }) as Promise<Guide>;
    for (const c of [admin, am]) expect((await list(c)).guides.map((g) => g.helpKey).sort(), c.role).toEqual([...AGENCY_KEYS, ...ACCOUNT_AGENCY_ROLE].sort());
    // Client roles read no agency page guide; the account guides are the only ones they see in the agency context.
    for (const c of [owner, viewer]) expect((await list(c)).guides.map((g) => g.helpKey).sort(), c.role).toEqual(ACCOUNT_CLIENT_ROLE);
    for (const key of AGENCY_KEYS) {
      expect((await agencyGuide(admin, key))!.sections.map((s) => s.heading), key).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
      expect(await agencyGuide(owner, key), key).toBeNull();
    }
  });

  it('agency batch A: the guides carry the numbers and labels the pages use, and never name the product (the assistant is a placeholder, checked by the terminology test)', async () => {
    const agencyGuide = async (key: string) => text((await registry.invoke(admin, 'get_page_guide', { helpKey: key, context: 'agency' })) as Guide);
    const port = await agencyGuide('page:agency.portfolio');
    for (const w of ['High pressure (70 and above)', 'Medium pressure (40 to 69)', 'Low pressure (1 to 39)', 'Quiet (0)', '80%', '30 days', 'Finish setup']) expect(port, w).toContain(w);
    const wizard = await agencyGuide('page:agency.clients.new');
    for (const w of ['Your business', 'Finding competitors', 'Pick competitors', 'Invite the owner', 'Billing']) expect(wizard, w).toContain(w);
    expect(wizard).toContain('business type');
    const appr = await agencyGuide('page:agency.approvals');
    for (const w of ['Thursday night', 'Monday 07:00', 'Needs review', 'Failed — retrying']) expect(appr, w).toContain(w);
    const det = await agencyGuide('page:agency.approvals.detail');
    for (const w of ['85%', 'High confidence', 'Upsell', 'Send now']) expect(det, w).toContain(w);
    expect(det).not.toMatch(/medium confidence|low confidence/i);
    const alerts = await agencyGuide('page:agency.alerts');
    for (const w of ['70', '17:00', '3 instant alerts', '7 days', 'I review alerts first']) expect(alerts, w).toContain(w);
    const pr = await agencyGuide('page:agency.prospects.detail');
    for (const w of ['3 by 3 grid', 'Convert to client', 'client limit']) expect(pr, w).toContain(w);
    const leads = await agencyGuide('page:agency.leads');
    for (const w of ['Accept and invite', 'pool', 'Let them know', 'From your website', 'From the platform']) expect(leads, w).toContain(w);
    for (const key of AGENCY_KEYS) {
      const t = await agencyGuide(key);
      expect(t, key).not.toMatch(/rival\s*monday|\btheme/i);
      expect(t, key).not.toContain('{{');
    }
  });

  it('agency batch B: the settings guides carry the numbers and labels the pages use, and never name the product', async () => {
    const agencyGuide = async (key: string) => text((await registry.invoke(admin, 'get_page_guide', { helpKey: key, context: 'agency' })) as Guide);
    const bill = await agencyGuide('page:agency.settings.billing');
    for (const w of ['Payment overdue', 'Paused', 'Suspended', 'Seats', '7 days', '30 days', '1 to 90', 'extra-client price', 'active client that is not paused']) expect(bill, w).toContain(w);
    expect(bill).not.toMatch(/\$\d/);
    const intake = await agencyGuide('page:agency.settings.intake');
    for (const w of ['3 to 40', 'The old address stops working', 'does not redirect', 'Copy button HTML']) expect(intake, w).toContain(w);
    const access = await agencyGuide('page:agency.settings.platform-access');
    for (const w of ['60 minutes', 'read-only', 'audit log', 'Timed out', 'Access revoked']) expect(access, w).toContain(w);
    const usage = await agencyGuide('page:agency.settings.usage');
    for (const w of ['80%', '$1 to $10,000', '$15', '1 to 10', '0 to 100,000', 'UTC', 'Only questions from the client']) expect(usage, w).toContain(w);
    const hooks = await agencyGuide('page:agency.settings.slack-teams');
    for (const w of ['hooks.slack.com', 'webhook.office.com', 'logic.azure.com', 'environment.api.powerplatform.com']) expect(hooks, w).toContain(w);
    const team = await agencyGuide('page:agency.settings.team');
    for (const w of ['Admin', 'Account manager', 'Client owner', 'Client viewer', '14 days']) expect(team, w).toContain(w);
    const brand = await agencyGuide('page:agency.settings.branding');
    for (const w of ['registered name', '512 KB', '30 characters', '300 characters']) expect(brand, w).toContain(w);
    for (const key of AGENCY_B) {
      const t = await agencyGuide(key);
      expect(t, key).not.toMatch(/rival\s*monday|\btheme/i);
      expect(t, key).not.toContain('{{');
    }
  });

  it('platform batch (Task 9a): operators read the sixteen operator guides in the platform context, with the three standard sections', async () => {
    const platform = (await opRegistry.invoke(op, 'list_help_guides', { context: 'platform' })) as { guides: { helpKey: string }[] };
    expect(platform.guides.map((g) => g.helpKey).filter((k) => k.startsWith('page:platform.')).sort()).toEqual(PLATFORM_KEYS);
    for (const key of PLATFORM_KEYS) {
      const g = (await opRegistry.invoke(op, 'get_page_guide', { helpKey: key, context: 'platform' })) as Guide;
      expect(g!.sections.map((s) => s.heading), key).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
    }
    const rows = await dbs.service.select({ seedKey: kbArticle.seedKey, audience: kbArticle.audience, clientVisible: kbArticle.clientVisible, level: kbArticle.level }).from(kbArticle);
    for (const key of PLATFORM_KEYS) {
      const r = rows.find((x) => x.seedKey === `${key}#operator`);
      expect(r, key).toMatchObject({ audience: 'operator', clientVisible: false, level: 'platform' });
    }
  });

  it('platform batch: operator guides are hidden from agency and client roles in every context, and the platform context itself is refused to them', async () => {
    const asGuide = (c: AccessContext, input: Record<string, unknown>) => registry.invoke(c, 'get_page_guide', input) as Promise<Guide>;
    for (const key of PLATFORM_KEYS) {
      expect(await asGuide(admin, { helpKey: key, context: 'agency' }), `admin ${key}`).toBeNull();
      expect(await asGuide(am, { helpKey: key, context: 'client', clientId: IDS.clientA1 }), `am ${key}`).toBeNull();
      expect(await asGuide(owner, { helpKey: key, context: 'client', clientId: IDS.clientA1 }), `owner ${key}`).toBeNull();
      expect(await asGuide(viewer, { helpKey: key, context: 'client', clientId: IDS.clientA1 }), `viewer ${key}`).toBeNull();
    }
    for (const c of [admin, am, owner, viewer]) {
      await expect(registry.invoke(c, 'get_page_guide', { helpKey: PLATFORM_KEYS[0], context: 'platform' }), c.role).rejects.toMatchObject({ code: 'not_found' });
      await expect(registry.invoke(c, 'list_help_guides', { context: 'platform' }), c.role).rejects.toMatchObject({ code: 'not_found' });
    }
    // The agency and client lists never carry a platform key (the agency list is exact: see the agency batches above).
    for (const c of [admin, am]) {
      const { guides } = (await registry.invoke(c, 'list_help_guides', { context: 'client', clientId: IDS.clientA1 })) as { guides: { helpKey: string }[] };
      expect(guides.map((g) => g.helpKey).filter((k) => k.startsWith('page:platform.')), c.role).toEqual([]);
    }
  });

  it('platform batch: the guides carry the numbers and labels the pages use, say "topic" not "theme", and leave no placeholder unfilled', async () => {
    const pg = async (key: string) => text((await opRegistry.invoke(op, 'get_page_guide', { helpKey: `page:platform.${key}`, context: 'platform' })) as Guide);
    const want: Record<string, string[]> = {
      overview: ['Last 28 days', '12 weeks', '12 months', 'Monday', '7 days', '20 at a time'],
      agencies: ['At risk', 'Idle', 'Growing', 'Steady', '28 days', '14 days', '7 days', '30 days'],
      'agencies.detail': ['60 minutes', 'read-only', '5 to 300', 'audit log', 'View as agency'],
      billing: ['agency ids', '100', '1,000', '1 to 90', '14 if blank', '1 to 36', '30 or 90 days', 'shown once'],
      leads: ['200', 'Declined by an agency', 'Assign', '20'],
      reviews: ['Jev', '0.85', 'language model', 'Model said', 'gold labels', '50'],
      themes: ['topic', '20', '90 days', 'fifth', '30 days'],
      ask: ['audit log', 'quota', '25'],
      'ask.thread': ['Citations', 'Trace', 'cancelled'],
      knowledge: ['Managed in repo', 'kb:seed', 'Sunday at 05:00 UTC', 'Published'],
      'knowledge.new': ['Visible to client users', 'Preview', 'Publish'],
      'knowledge.detail': ['Managed in repo', 'Auto-sync', 'Previous version', 'cannot be undone'],
      health: ['Agencies', 'Costs'],
      costs: ['06:00 UTC', '14 days', '7 days', 'six months', '30 days', 'Projected this month'],
      verticals: ['old id', 'Merge into', 'Evidence', 'owners and staff'],
      runbook: ['Update available', 'Removed upstream', 'owners and staff'],
    };
    for (const k of PLATFORM_KEYS.map((x) => x.replace('page:platform.', ''))) {
      const t = await pg(k);
      for (const w of want[k]!) expect(t, `${k}: ${w}`).toContain(w);
      expect(t, k).not.toMatch(/\bthemes?\b/i);
      expect(t, k).not.toContain('{{');
    }
  });

  it('account batch (Task 9b): Inbox and Notification settings give each audience its own guide; the wizard has an agency guide only; all have the three standard sections', async () => {
    const acct = (c: AccessContext, helpKey: string, context: 'agency' | 'client' = 'agency') =>
      registry.invoke(c, 'get_page_guide', { helpKey, context, ...(context === 'client' ? { clientId: IDS.clientA1 } : {}) }) as Promise<Guide>;
    for (const key of ACCOUNT_SPLIT) {
      const [o, v, a, m] = await Promise.all([acct(owner, key), acct(viewer, key), acct(admin, key), acct(am, key)]);
      expect(o!.id, key).toBe(v!.id);
      expect(a!.id, key).toBe(m!.id);
      expect(a!.id, key).not.toBe(o!.id);
      for (const g of [o, a]) expect(g!.sections.map((s) => s.heading), key).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
      // The same guide whichever context the page is opened in (account pages are the same everywhere).
      expect((await acct(owner, key, 'client'))!.id, key).toBe(o!.id);
      expect((await acct(admin, key, 'client'))!.id, key).toBe(a!.id);
    }
    const key = 'page:account.onboarding';
    expect((await acct(admin, key))!.sections.map((s) => s.heading)).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
    for (const c of [owner, viewer]) {
      expect(await acct(c, key), c.role).toBeNull();
      expect(await acct(c, key, 'client'), c.role).toBeNull();
    }
    const rows = await dbs.service.select({ seedKey: kbArticle.seedKey, audience: kbArticle.audience, clientVisible: kbArticle.clientVisible, level: kbArticle.level }).from(kbArticle);
    for (const seed of ACCOUNT_SEEDS) {
      const r = rows.find((x) => x.seedKey === seed);
      const audience = seed.split('#')[1];
      expect(r, seed).toMatchObject({ audience, clientVisible: audience === 'client', level: 'platform' });
    }
  });

  it('account guides list in every context, each viewer with its own version, and a client role never gets the agency-only wizard guide', async () => {
    const list = async (c: AccessContext, input: Record<string, unknown>) =>
      ((await registry.invoke(c, 'list_help_guides', input)) as { guides: { helpKey: string; articleId: string }[] }).guides.filter((g) => g.helpKey.startsWith('page:account.'));
    const own = async (c: AccessContext, key: string) => (await guide(c, key))?.id;
    for (const [c, keys] of [[admin, ACCOUNT_AGENCY_ROLE], [am, ACCOUNT_AGENCY_ROLE], [owner, ACCOUNT_CLIENT_ROLE], [viewer, ACCOUNT_CLIENT_ROLE]] as const) {
      for (const input of [{ context: 'agency' }, { context: 'client', clientId: IDS.clientA1 }]) {
        const got = await list(c, input);
        expect(got.map((g) => g.helpKey).sort(), `${c.role} ${input.context}`).toEqual(keys);
        // The listed article is the very one the page opens for this role: the agency or the client version.
        for (const g of got) expect(g.articleId, `${c.role} ${g.helpKey}`).toBe(await own(c, g.helpKey));
      }
    }
    const [forAdmin, forOwner] = [await list(admin, { context: 'agency' }), await list(owner, { context: 'agency' })];
    for (const key of ACCOUNT_SPLIT) expect(forAdmin.find((g) => g.helpKey === key)!.articleId, key).not.toBe(forOwner.find((g) => g.helpKey === key)!.articleId);
    expect(forOwner.map((g) => g.helpKey)).not.toContain('page:account.onboarding');
  });

  it('account batch: the guides carry the labels and numbers the pages use; the client versions leave the agency content out; nothing names the product or leaves a placeholder', async () => {
    const agencyText = async (c: AccessContext, key: string) => text(await (registry.invoke(c, 'get_page_guide', { helpKey: key, context: 'agency' }) as Promise<Guide>));
    const inboxA = await agencyText(admin, 'page:account.inbox');
    for (const w of ['latest 100', 'Client alerts (agency)', 'Brief ready for review', 'Brief failed', 'Brief overdue', 'Rank scan skipped', 'Quarterly report', 'Mark all read', 'In-app']) expect(inboxA, w).toContain(w);
    const inboxC = await agencyText(owner, 'page:account.inbox');
    for (const w of ['latest 100', 'Instant alerts', 'Alert digest', 'Weekly brief', 'Quarterly report', 'Mark all read']) expect(inboxC, w).toContain(w);
    expect(inboxC).not.toMatch(/Client alerts|Brief (ready|failed|overdue)|Rank scan|cost cap|approval|account manager|Agency settings/i);
    const setA = await agencyText(admin, 'page:account.settings.notifications');
    for (const w of ['Client alerts (agency)', 'Rank scan skipped', 'US Central time (America/Chicago)', '21:00 to 07:00', 'no Save button', 'held and sent when it ends']) expect(setA, w).toContain(w);
    const setC = await agencyText(owner, 'page:account.settings.notifications');
    for (const w of ['Instant alerts', 'Alert digest', 'Weekly brief', 'Quarterly report', '21:00 to 07:00', 'time zone saved for your business', 'invitation']) expect(setC, w).toContain(w);
    expect(setC).not.toMatch(/Client alerts|Rank scan|Central|Chicago|Slack|Teams|Agency settings|account manager/i);
    const wizard = await agencyText(admin, 'page:account.onboarding');
    for (const w of ['Your agency', 'Invite your team', 'Your plan', 'Make it yours', 'Skip for now', 'Add payment method', 'Getting started', 'Agency admin', 'Account manager', 'Skipped']) expect(wizard, w).toContain(w);
    for (const t of [inboxA, inboxC, setA, setC, wizard]) {
      expect(t).not.toMatch(/rival\s*monday|\btheme/i);
      expect(t).not.toContain('{{');
    }
  });

  it('the client Changes guide leaves out the alert caps (owner 2026-10-20) that the agency guide keeps', async () => {
    expect(text(await guide(owner, 'page:client.changes'))).not.toMatch(/3 a day|7 days|3 instant/i);
    expect(text(await guide(admin, 'page:client.changes'))).toMatch(/3 instant alerts/);
  });

  it('the agency versions cover what agency staff need', async () => {
    const overview = text(await guide(admin, 'page:client.overview'));
    for (const w of ['Upsell', 'Approvals', 'Pitch snapshot', 'Settings › Delivery', 'place id']) expect(overview, w).toContain(w);
    const changes = text(await guide(admin, 'page:client.changes'));
    for (const w of ['routing', 'Settings › Alert rules', 'Archived']) expect(changes, w).toContain(w);
    const reviews = text(await guide(admin, 'page:client.reviews'));
    expect(reviews).toContain('Settings › Business profile');
    expect(`${overview}\n${changes}\n${reviews}`).not.toContain('{{');
  });
});
