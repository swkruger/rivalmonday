import { mcpScopeOf, type TokenScope } from '@cs/core';
import { brief, briefItem, detectedChange, move, recommendation } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ASK_WRITE_TOOLS } from '../ask-tools';
import { allTools } from './all';
import { ago, ctx, dbs, registry, resetWorkspace, seedAds, seedCapture, seedEvent, seedMove, seedReview } from './workspace-fixtures';

/**
 * Binding allowlists (spec d5). Later tasks append their tool to the matching set:
 * Task 4c adds `add_recommendation` to MCP_FEEDBACK_TOOLS, Tasks 5-6 add `search` and `fetch` to MCP_READ_TOOLS.
 */
const MCP_READ_TOOLS = [
  'list_clients', 'get_client_profile', 'list_client_competitors', 'get_competitor_profile', 'get_competitor_timeline', 'search_events', 'get_event',
  'get_evidence', 'compare_snapshots', 'get_price_matrix', 'get_price_history', 'list_ads', 'get_ad_activity', 'get_theme_benchmark', 'search_reviews',
  'get_rating_trend', 'get_geogrid', 'get_share_of_voice', 'list_moves', 'get_move', 'list_briefs', 'get_brief', 'list_recommendations', 'list_alerts', 'get_usage',
  'search', 'fetch', 'search_knowledge', 'get_competitor_signals',
];
const MCP_FEEDBACK_TOOLS = ['submit_feedback', 'update_recommendation_status', 'add_recommendation'];
const MCP_MANAGE_TOOLS = ['set_alert_rules', 'update_client_profile', 'set_page_pin', 'run_prospect_snapshot'];
/** Ruling R1: tools that exist only on the mcp channel. */
const MCP_ONLY_TOOLS = ['add_recommendation'];
const SKIP_WEB_TOOLS = ['list_clients', 'get_competitor_search_status', 'get_prospect_report', 'platform_overview', 'list_platform_agencies', 'get_platform_agency', 'list_platform_activity', 'list_agency_support_sessions', 'start_support_session',
  'list_platform_costs', 'refresh_platform_costs', 'update_platform_cost_service', 'save_platform_cost_item', 'archive_platform_cost_item',
  'attach_agency_discount', 'create_discount_code', 'create_invite_link', 'create_plan_version', 'end_pilot', 'extend_trial', 'get_agency_billing', 'get_billing_overview', 'get_connect_overview', 'grant_pilot', 'list_discount_codes', 'list_invite_links', 'list_plans', 'revoke_discount_code', 'revoke_invite_link', 'set_connect_fee_percent', 'set_seat_cap_exempt'];

const mcpTools = allTools.filter((t) => (t.channels ?? ['web']).includes('mcp'));
const namesOfScope = (scope: TokenScope) => mcpTools.filter((t) => mcpScopeOf(t) === scope).map((t) => t.name).sort();

const admin = ctx('agency_admin', 'all');
const mcp = (tokenScope: TokenScope) => ({ channel: 'mcp' as const, tokenId: 'pat-1', tokenScope });

beforeEach(resetWorkspace);

describe('mcp channel tagging', () => {
  it('mcp read tools are exactly the d5 list', () => {
    expect(namesOfScope('read')).toEqual([...MCP_READ_TOOLS].sort());
    const visible = registry.list(admin, { channel: 'mcp', tokenScope: 'read' }).map((t) => t.name).sort();
    expect(visible).toEqual([...MCP_READ_TOOLS].sort());
  });

  it('feedback and manage lists exact', () => {
    expect(namesOfScope('feedback')).toEqual([...MCP_FEEDBACK_TOOLS].sort());
    expect(namesOfScope('manage')).toEqual([...MCP_MANAGE_TOOLS].sort());
    const all = registry.list(admin, { channel: 'mcp', tokenScope: 'manage' }).map((t) => t.name).sort();
    expect(all).toEqual([...MCP_READ_TOOLS, ...MCP_FEEDBACK_TOOLS, ...MCP_MANAGE_TOOLS].sort());
  });

  it("every mcp tool's input converts to an object JSON schema", () => {
    for (const t of mcpTools) {
      const schema = z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }) as { type?: string };
      expect(schema.type, t.name).toBe('object');
    }
  });

  it('skip-web tools are exactly the reviewed list', () => {
    expect(allTools.filter((t) => t.audit === 'skip-web').map((t) => t.name).sort()).toEqual([...SKIP_WEB_TOOLS].sort());
  });

  it('no web-only tool leaks into mcp', () => {
    const allowed = new Set([...MCP_READ_TOOLS, ...MCP_FEEDBACK_TOOLS, ...MCP_MANAGE_TOOLS]);
    expect(mcpTools.filter((t) => !allowed.has(t.name)).map((t) => t.name)).toEqual([]);
    for (const t of mcpTools.filter((x) => !MCP_ONLY_TOOLS.includes(x.name))) expect(t.channels, t.name).toContain('web');
    expect(registry.describe(admin, { channel: 'mcp', tokenScope: 'manage' }).map((d) => d.name)).not.toContain('approve_brief');
  });
});

describe('client-facing filters over the catalogue', () => {
  const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1 };
  const period = { periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z'), deliveryDate: '2026-10-05' };
  const item = (briefId: string, ord: number) => ({
    ...base, briefId, ord, competitorId: IDS.competitorX, headline: `h${ord}`, whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r',
    confidence: 0.9, effort: 'L', impact: 'H', upsellTag: 'ppc_audit',
  });

  it('get_brief sorts items by ord with gaps [9,2,5]', async () => {
    const [b] = await dbs.owner.insert(brief).values({ ...base, ...period, status: 'sent', summary: 'Sent', sentAt: new Date() }).returning();
    for (const ord of [9, 2, 5]) await dbs.owner.insert(briefItem).values(item(b!.id, ord));
    const out = (await registry.invoke(admin, 'get_brief', { briefId: b!.id })) as { items: { ord: number }[] };
    expect(out.items.map((i) => i.ord)).toEqual([2, 5, 9]);
  });

  it('client role sees null upsellTag in get_brief and list_recommendations', async () => {
    const [b] = await dbs.owner.insert(brief).values({ ...base, ...period, status: 'approved', summary: 'OK', approvedAt: new Date() }).returning();
    await dbs.owner.insert(briefItem).values(item(b!.id, 1));
    await dbs.owner.insert(recommendation).values({ ...base, title: 'Bundle', rationale: 'r', effort: 'L', impact: 'H', owner: 'client', source: 'brief', upsellTag: 'ppc_audit' });
    const viewer = ctx('client_viewer', [IDS.clientA1]);
    const brf = (await registry.invoke(viewer, 'get_brief', { briefId: b!.id })) as { items: { upsellTag: unknown }[] };
    expect(brf.items).toHaveLength(1);
    expect(brf.items.every((i) => i.upsellTag === null)).toBe(true);
    const recs = (await registry.invoke(viewer, 'list_recommendations', { clientId: IDS.clientA1 })) as { items: { upsellTag: unknown }[] };
    expect(recs.items).toHaveLength(1);
    expect(recs.items.every((i) => i.upsellTag === null)).toBe(true);
    const asAdmin = (await registry.invoke(admin, 'list_recommendations', { clientId: IDS.clientA1 })) as { items: { upsellTag: unknown }[] };
    expect(asAdmin.items[0]!.upsellTag).toBe('ppc_audit');
  });
});

describe('d12 redaction on non-web channels', () => {
  const PHONE = '(512) 555-0147';

  it('get_evidence over mcp redacts a phone number in citedBy summary; web does not', async () => {
    const before = await seedCapture();
    const after = await seedCapture();
    await seedEvent({ score: 86, route: 'alert', ageDays: 0, summary: `Smith HVAC now says call ${PHONE} for a quote`, captures: { before: before.captureId, after: after.captureId } });
    const input = { clientId: IDS.clientA1, evidenceId: after.ids.text };
    const viaMcp = (await registry.invoke(admin, 'get_evidence', input, mcp('read'))) as { citedBy: { summary: string }[] };
    expect(viaMcp.citedBy).toHaveLength(1);
    expect(viaMcp.citedBy[0]!.summary).not.toContain('555-0147');
    expect(viaMcp.citedBy[0]!.summary).toContain('Smith HVAC');
    const viaWeb = (await registry.invoke(admin, 'get_evidence', input)) as { citedBy: { summary: string }[] };
    expect(viaWeb.citedBy[0]!.summary).toContain(PHONE);
  });

  it('compare_snapshots over mcp redacts diff text; web does not', async () => {
    const b = await seedCapture();
    const a = await seedCapture();
    const { changeId } = await seedEvent({ score: 86, route: 'alert', ageDays: 0, captures: { before: b.captureId, after: a.captureId } });
    await dbs.owner.update(detectedChange).set({ beforeText: 'Call us', afterText: `Call us ${PHONE}` }).where(eq(detectedChange.id, changeId));
    const text = (v: { diff: { text: string }[] }) => v.diff.map((d) => d.text).join('');
    const viaMcp = (await registry.invoke(admin, 'compare_snapshots', { clientId: IDS.clientA1, changeId }, mcp('read'))) as { diff: { text: string }[] };
    expect(text(viaMcp)).not.toContain('555-0147');
    const viaWeb = (await registry.invoke(admin, 'compare_snapshots', { clientId: IDS.clientA1, changeId })) as { diff: { text: string }[] };
    expect(text(viaWeb)).toContain('555-0147');
  });

  it('search_reviews over mcp redacts a person name', async () => {
    await seedReview({ text: 'Dave Thompson showed up late and was rude', ownerAnswer: `Sorry, Dave Thompson will call you at ${PHONE}`, postedAt: ago(1) });
    const input = { clientId: IDS.clientA1 };
    const viaMcp = (await registry.invoke(admin, 'search_reviews', { ...input, detail: 'full' }, mcp('read'))) as { items: { text: string; ownerAnswer: string }[] };
    expect(viaMcp.items[0]!.text).not.toContain('Thompson');
    expect(viaMcp.items[0]!.text).toContain('[name]');
    expect(viaMcp.items[0]!.ownerAnswer).not.toContain('555-0147');
    const viaWeb = (await registry.invoke(admin, 'search_reviews', input)) as { items: { text: string }[] };
    expect(viaWeb.items[0]!.text).toContain('Dave Thompson');
  });

  const phoneEvent = () => seedEvent({ score: 86, route: 'alert', ageDays: 0, summary: `Smith HVAC now says call ${PHONE} for a quote` });

  it('search_events (detail full) over mcp redacts the event summary; web does not', async () => {
    await phoneEvent();
    const input = { clientId: IDS.clientA1, detail: 'full' };
    const viaMcp = (await registry.invoke(admin, 'search_events', input, mcp('read'))) as { items: { summary: string }[] };
    expect(viaMcp.items).toHaveLength(1);
    expect(viaMcp.items[0]!.summary).not.toContain('555-0147');
    expect(viaMcp.items[0]!.summary).toContain('Smith HVAC');
    const viaWeb = (await registry.invoke(admin, 'search_events', input)) as { items: { summary: string }[] };
    expect(viaWeb.items[0]!.summary).toContain(PHONE);
  });

  it('get_event over mcp redacts the event summary; web does not', async () => {
    const { eventId } = await phoneEvent();
    const input = { clientId: IDS.clientA1, eventId };
    const viaMcp = (await registry.invoke(admin, 'get_event', input, mcp('read'))) as { summary: string };
    expect(viaMcp.summary).not.toContain('555-0147');
    const viaWeb = (await registry.invoke(admin, 'get_event', input)) as { summary: string };
    expect(viaWeb.summary).toContain(PHONE);
  });

  it('list_moves (detail full) over mcp redacts the move summary; web does not', async () => {
    const { eventId } = await phoneEvent();
    const m = await seedMove([eventId]);
    await dbs.owner.update(move).set({ summary: `Price war: call ${PHONE}` }).where(eq(move.id, m));
    const input = { clientId: IDS.clientA1, detail: 'full' };
    const viaMcp = (await registry.invoke(admin, 'list_moves', input, mcp('read'))) as { items: { summary: string }[] };
    expect(viaMcp.items).toHaveLength(1);
    expect(viaMcp.items[0]!.summary).not.toContain('555-0147');
    const viaWeb = (await registry.invoke(admin, 'list_moves', input)) as { items: { summary: string }[] };
    expect(viaWeb.items[0]!.summary).toContain(PHONE);
  });

  it('get_move over mcp redacts the move and event summaries; web does not', async () => {
    const { eventId } = await phoneEvent();
    const m = await seedMove([eventId]);
    await dbs.owner.update(move).set({ summary: `Price war: call ${PHONE}` }).where(eq(move.id, m));
    const input = { clientId: IDS.clientA1, moveId: m };
    const viaMcp = (await registry.invoke(admin, 'get_move', input, mcp('read'))) as { summary: string; events: { summary: string }[] };
    expect(viaMcp.summary).not.toContain('555-0147');
    expect(viaMcp.events[0]!.summary).not.toContain('555-0147');
    const viaWeb = (await registry.invoke(admin, 'get_move', input)) as { summary: string; events: { summary: string }[] };
    expect(viaWeb.summary).toContain(PHONE);
    expect(viaWeb.events[0]!.summary).toContain(PHONE);
  });

  it('list_ads over mcp redacts creative text; web does not', async () => {
    await seedAds({ ads: [{ platform: 'meta', externalId: 'a1', title: `Call ${PHONE}`, text: `Ask for ${PHONE} today`, isActive: true, firstSeenAt: ago(3), lastSeenAt: ago(1) }] });
    const viaMcp = (await registry.invoke(admin, 'list_ads', { clientId: IDS.clientA1, detail: 'full' }, mcp('read'))) as { items: { title: string; text: string }[] };
    expect(viaMcp.items).toHaveLength(1);
    expect(`${viaMcp.items[0]!.title}${viaMcp.items[0]!.text}`).not.toContain('555-0147');
    const viaWeb = (await registry.invoke(admin, 'list_ads', { clientId: IDS.clientA1 })) as { items: { text: string }[] };
    expect(viaWeb.items[0]!.text).toContain(PHONE);
  });
});

describe('ask channel tagging (Q4)', () => {
  const ASK_TOOLS = [...MCP_READ_TOOLS, ...ASK_WRITE_TOOLS].sort();
  const TOKEN_GRANT_TOOLS = ['create_api_token', 'list_api_tokens', 'revoke_api_token', 'list_oauth_grants', 'revoke_oauth_grant'];
  const askTools = allTools.filter((t) => (t.channels ?? ['web']).includes('ask'));
  const askClient = (features: string[]) => ctx('client_viewer', [IDS.clientA1], features as never);

  it('ask set is exactly the mcp read tools plus the three writes', () => {
    const derived = allTools
      .filter((t) => ((t.channels ?? ['web']).includes('mcp') && mcpScopeOf(t) === 'read') || (ASK_WRITE_TOOLS as readonly string[]).includes(t.name))
      .map((t) => t.name)
      .sort();
    expect(askTools.map((t) => t.name).sort()).toEqual(derived);
    expect(derived).toEqual(ASK_TOOLS);
    expect(ASK_WRITE_TOOLS).toEqual(['submit_feedback', 'update_recommendation_status', 'add_recommendation']);
  });

  it('every ask tool also keeps its other channels (explicit literal)', () => {
    for (const t of askTools.filter((x) => !MCP_ONLY_TOOLS.includes(x.name))) expect(t.channels, t.name).toEqual(['web', 'mcp', 'ask']);
    expect(allTools.find((t) => t.name === 'add_recommendation')!.channels).toEqual(['mcp', 'ask']);
  });

  it('token tools not visible on ask', () => {
    const names = registry.describe(admin, { channel: 'ask' }).map((d) => d.name);
    for (const n of TOKEN_GRANT_TOOLS) expect(names, n).not.toContain(n);
    expect(names.sort()).toEqual(ASK_TOOLS);
  });

  it('client_viewer without ask feature sees no tools on ask', () => {
    expect(registry.list(askClient(['dashboard']), { channel: 'ask' })).toEqual([]);
  });

  it('client role sees no agency-only tool on ask', () => {
    const names = registry.list(askClient(['dashboard', 'ask']), { channel: 'ask' }).map((t) => t.name);
    expect(names).not.toContain('add_recommendation');
    for (const n of [...TOKEN_GRANT_TOOLS, 'set_alert_rules', 'update_client_profile', 'set_page_pin', 'run_prospect_snapshot']) expect(names, n).not.toContain(n);
  });
});
