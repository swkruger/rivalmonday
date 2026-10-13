import { createAccessContext } from '@cs/core';
import { agency, alert, brief, briefItem, captureBlock, changeEvent, client, EMBEDDING_DIMENSIONS, kbArticle, kbChunk, recommendation } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { createPackLoader } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import { ctx, dbs, pageId, registry, resetWorkspace, seedCapture, seedEvent, seedPage, seedReview } from './workspace-fixtures';

type Out = { results: { id: string; title: string; snippet: string; url: string }[] };

const admin = ctx('agency_admin', 'all');
const viewer = ctx('client_viewer', [IDS.clientA1], ['dashboard', 'mcp']);
const mcp = { channel: 'mcp' as const, tokenId: 'pat-1', tokenScope: 'read' as const };
const unit = (i: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, j) => (j === i ? 1 : 0));
const withDeps = (extra: Partial<ToolDeps>) =>
  createToolRegistry({ app: dbs.app, service: dbs.service, packs: createPackLoader(), ...extra }, { audit: { record: async () => {} } });

const search = (c: typeof admin, input: Record<string, unknown>, reg = registry) => reg.invoke(c, 'search', input, mcp) as Promise<Out>;
const ids = (out: Out) => out.results.map((r) => r.id);

const period = { periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z') };
async function seedBriefItem(status: string, headline: string, deliveryDate = '2026-10-05', itemStatus = 'active'): Promise<string> {
  const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, ...period, deliveryDate, status, summary: 's' }).returning();
  const [i] = await dbs.owner.insert(briefItem).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId: b!.id, ord: 1, competitorId: IDS.competitorX, headline, whatChanged: 'Smith HVAC changed something',
    whyItMatters: 'It matters', recommendedAction: 'Respond', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: [], status: itemStatus, upsellTag: 'seo_audit',
  }).returning();
  return i!.id;
}
async function seedAlert(status: string, headline: string, eventId: string): Promise<string> {
  const [a] = await dbs.owner.insert(alert).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId, score: 82, headline, body: 'Smith HVAC moved.', status, mode: 'after_am_check', evidenceIds: [],
  }).returning();
  return a!.id;
}
async function seedRecommendation(title: string): Promise<string> {
  const [r] = await dbs.owner.insert(recommendation).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, title, rationale: 'Because the competitor moved.', effort: 'L', impact: 'H', owner: 'client', source: 'brief', upsellTag: 'ppc',
  }).returning();
  return r!.id;
}

async function seedKb(o: { title?: string; body: string; level?: 'platform' | 'agency' | 'client'; agencyId?: string | null; clientId?: string | null }): Promise<string> {
  const level = o.level ?? 'agency';
  const agencyId = o.agencyId !== undefined ? o.agencyId : level === 'platform' ? null : IDS.agencyA;
  const clientId = o.clientId ?? null;
  const [a] = await dbs.owner.insert(kbArticle).values({
    level, agencyId, clientId, kind: 'help', title: o.title ?? 'Guide', bodyMd: o.body, status: 'published', clientVisible: true, source: 'manual', createdBy: 't', updatedBy: 't',
  }).returning();
  await dbs.owner.insert(kbChunk).values({ articleId: a!.id, level, agencyId, clientId, clientVisible: true, ord: 0, text: o.body });
  return a!.id;
}

const supportCtx = createAccessContext({ agencyId: IDS.agencyA, userId: 'op-1', role: 'agency_admin', clientScope: 'all', features: [], support: { sessionId: '00000000-0000-4000-8000-000000000001', platformUserId: 'op-1' } });

beforeEach(resetWorkspace);
afterEach(() => vi.restoreAllMocks());

describe('search', () => {
  it('finds an event by summary words', async () => {
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC cut its furnace repair price' });
    const out = await search(admin, { query: 'furnace repair', clientId: IDS.clientA1 });
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ id: `event:${ev.eventId}`, title: 'Smith HVAC: Price change', url: `/c/${IDS.clientA1}/changes?event=${ev.eventId}` });
    expect(out.results[0]!.snippet).toContain('furnace');
  });

  it("never returns another client's event on a shared competitor", async () => {
    // B1 (agency B) also tracks Smith HVAC; its event and embedding must never reach A1.
    const theirs = await seedEvent({ score: 90, route: 'alert', ageDays: 1, summary: 'Smith HVAC boiler giveaway', agencyId: IDS.agencyB, clientId: IDS.clientB1 });
    await dbs.owner.update(changeEvent).set({ embedding: unit(0) }).where(eq(changeEvent.id, theirs.eventId));
    // A page of Bright Smiles (tracked by A2 only) is never a page hit for A1.
    const yPage = await seedPage({ competitorId: IDS.competitorY });
    const yCap = await seedCapture({ competitorId: IDS.competitorY, pageId: yPage });
    await dbs.owner.insert(captureBlock).values({ captureId: yCap.captureId, competitorId: IDS.competitorY, trackedPageId: yPage, ord: 0, blockKey: 'b0', path: 'main', text: 'Boiler giveaway', textSha: 's', embedding: unit(0) });
    const reg = withDeps({ embedQuery: async () => unit(0) });
    expect(await search(admin, { query: 'boiler giveaway', clientId: IDS.clientA1 }, reg)).toEqual({ results: [] });
    expect(ids(await search(admin, { query: 'boiler giveaway', clientId: IDS.clientA2 }, reg))).toEqual([`page:${yPage}`]);
    expect(await search(viewer, { query: 'boiler giveaway' }, reg)).toEqual({ results: [] });
    // ...while B1's own users find it.
    const bAdmin = ctx('agency_admin', 'all', [], IDS.agencyB);
    expect(ids(await search(bAdmin, { query: 'boiler giveaway' }))).toEqual([`event:${theirs.eventId}`]);
  });

  it('excludes retracted events', async () => {
    await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC duct cleaning promo', retracted: true });
    expect((await search(admin, { query: 'duct cleaning', clientId: IDS.clientA1 })).results).toEqual([]);
  });

  it('client role sees no ready brief items or undelivered alerts', async () => {
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'unrelated' });
    const ready = await seedBriefItem('ready', 'Thermostat bundle ready', '2026-10-12');
    const sent = await seedBriefItem('sent', 'Thermostat bundle sent', '2026-10-05');
    await seedBriefItem('sent', 'Thermostat bundle dropped', '2026-09-28', 'dropped');
    await seedBriefItem('generating', 'Thermostat bundle generating', '2026-10-19');
    const pending = await seedAlert('pending_review', 'Thermostat alert pending', ev.eventId);
    const delivered = await seedAlert('delivered', 'Thermostat alert delivered', ev.eventId);
    const asViewer = ids(await search(viewer, { query: 'thermostat', types: ['brief_item', 'alert'] })).sort();
    expect(asViewer).toEqual([`alert:${delivered}`, `brief_item:${sent}`].sort());
    const asAdmin = ids(await search(admin, { query: 'thermostat', clientId: IDS.clientA1, types: ['brief_item', 'alert'] })).sort();
    expect(asAdmin).toEqual([`alert:${delivered}`, `alert:${pending}`, `brief_item:${ready}`, `brief_item:${sent}`].sort());
  });

  it('no dashboard feature drops event/review/page', async () => {
    await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC heat pump offer' });
    await seedReview({ text: 'Their heat pump install was great' });
    const rec = await seedRecommendation('Answer the heat pump offer');
    const blind = ctx('client_viewer', [IDS.clientA1], ['mcp']);
    const reg = withDeps({ embedQuery: vi.fn(async () => unit(0)) });
    expect(ids(await search(blind, { query: 'heat pump' }, reg))).toEqual([`recommendation:${rec}`]);
    expect(ids(await search(blind, { query: 'heat pump', types: ['event', 'review', 'page'] }, reg))).toEqual([]);
    expect(ids(await search(viewer, { query: 'heat pump' }))).toHaveLength(3);
  });

  it('agency with two clients and no clientId → invalid_input', async () => {
    await expect(search(admin, { query: 'anything' })).rejects.toMatchObject({ code: 'invalid_input', message: 'Pass clientId: you can see more than one client.' });
  });

  it('prospect clientId → not_found', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    await expect(search(admin, { query: 'anything', clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(search(admin, { query: 'anything', clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(search(viewer, { query: 'anything', clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    // One active client left in scope: it is used without clientId.
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC water heater sale' });
    expect(ids(await search(admin, { query: 'water heater' }))).toEqual([`event:${ev.eventId}`]);
  });

  it('a bound client role whose client is a prospect gets not_found', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    await expect(search(viewer, { query: 'anything' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('embedding failure falls back to FTS', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC secret mini split deal' });
    const reg = withDeps({ embedQuery: async () => { throw new Error('openrouter down'); } });
    expect(ids(await search(admin, { query: 'mini split', clientId: IDS.clientA1 }, reg))).toEqual([`event:${ev.eventId}`]);
    expect(warn).toHaveBeenCalledWith('[search] embeddings unavailable');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('mini split');
  });

  it('vector hit merges with FTS hit', async () => {
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC radiant floor special' });
    await dbs.owner.update(changeEvent).set({ embedding: unit(0) }).where(eq(changeEvent.id, ev.eventId));
    const other = await seedEvent({ score: 60, route: 'brief', ageDays: 2, summary: 'Smith HVAC new hours' });
    await dbs.owner.update(changeEvent).set({ embedding: unit(1) }).where(eq(changeEvent.id, other.eventId));
    // Two captures of the pricing page: only the latest one's blocks count, one result per page.
    const old = await seedCapture({ at: new Date(Date.now() - 86_400_000) });
    const latest = await seedCapture();
    const block = (captureId: string, ord: number, text: string, e: number[]) =>
      ({ captureId, competitorId: IDS.competitorX, trackedPageId: pageId, ord, blockKey: `b${ord}`, path: 'main', text, textSha: `s${ord}`, embedding: e });
    await dbs.owner.insert(captureBlock).values([
      block(old.captureId, 0, 'Old pricing block', unit(0)),
      block(latest.captureId, 0, 'Underfloor heating from $4,000, call 512-555-0199', unit(0)),
      block(latest.captureId, 1, 'Footer', unit(2)),
    ]);
    const embed = vi.fn(async (_text: string, _scope: unknown) => unit(0));
    const out = await search(admin, { query: 'radiant floor', clientId: IDS.clientA1 }, withDeps({ embedQuery: embed }));
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed.mock.calls[0]![1]).toEqual({ agencyId: IDS.agencyA, clientId: IDS.clientA1 });
    expect(ids(out)[0]).toBe(`event:${ev.eventId}`); // in both lists
    const page = out.results.find((r) => r.id === `page:${pageId}`);
    expect(page).toMatchObject({ title: 'Smith HVAC: /pricing', url: `/c/${IDS.clientA1}/competitors/${IDS.competitorX}` });
    expect(page!.snippet).toContain('Underfloor heating');
    expect(page!.snippet).toContain('[phone]');
    expect(out.results.filter((r) => r.id.startsWith('page:'))).toHaveLength(1);
    // Page hits are vector-only; without embedQuery none appear.
    expect(ids(await search(admin, { query: 'radiant floor', clientId: IDS.clientA1 })).some((id) => id.startsWith('page:'))).toBe(false);
  });

  it('snippet is redacted', async () => {
    await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC chimney sweep, call 512-555-0199 or jo@example.com' });
    for (const opts of [mcp, undefined]) {
      const out = (await registry.invoke(admin, 'search', { query: 'chimney sweep', clientId: IDS.clientA1 }, opts)) as Out;
      expect(out.results[0]!.snippet).toContain('[phone]');
      expect(out.results[0]!.snippet).not.toContain('555-0199');
      expect(out.results[0]!.snippet).not.toContain('jo@example.com');
    }
  });

  it('results carry type-prefixed ids and urls', async () => {
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC sump pump news' });
    const item = await seedBriefItem('sent', 'Sump pump headline');
    const al = await seedAlert('delivered', 'Sump pump alert', ev.eventId);
    const rec = await seedRecommendation('Promote sump pump checks');
    const rev = await seedReview({ text: 'Fixed our sump pump fast', rating: 4 });
    const reg = withDeps({ appUrl: 'https://app.example' });
    const out = await search(viewer, { query: 'sump pump', limit: 20 }, reg);
    const byId = new Map(out.results.map((r) => [r.id, r]));
    const base = 'https://app.example';
    expect(byId.get(`event:${ev.eventId}`)?.url).toBe(`${base}/c/${IDS.clientA1}/changes?event=${ev.eventId}`);
    expect(byId.get(`brief_item:${item}`)).toMatchObject({ title: 'Sump pump headline', url: `${base}/go/brief_item/${item}` });
    expect(byId.get(`alert:${al}`)).toMatchObject({ title: 'Sump pump alert', url: `${base}/go/alert/${al}` });
    expect(byId.get(`recommendation:${rec}`)).toMatchObject({ title: 'Promote sump pump checks', url: `${base}/c/${IDS.clientA1}/recommendations` });
    expect(byId.get(`review:${rev}`)).toMatchObject({ title: 'Smith HVAC review, 4★', url: `${base}/c/${IDS.clientA1}/reviews` });
    expect(out.results).toHaveLength(5);
    expect(JSON.stringify(out)).not.toMatch(/seo_audit|ppc|upsell/i);
    expect(ids(await search(viewer, { query: 'sump pump', limit: 2 }, reg))).toHaveLength(2);
  });

  it('validates input', async () => {
    await expect(search(admin, { query: '   ', clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(search(admin, { query: 'x', clientId: IDS.clientA1, types: ['event', 'event'] })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(search(admin, { query: 'x', clientId: IDS.clientA1, limit: 21 })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('returns knowledge hits rendered, redacted and linked to /kb, including the client own facts but never another tenant', async () => {
    await dbs.owner.update(agency).set({ branding: { displayName: 'Acme Intel' } as never }).where(eq(agency.id, IDS.agencyA));
    const art = await seedKb({ title: 'Welcome to {{product}}', body: 'Gutter quokka setup in {{product}}. Call 555-123-4567.' });
    const fact = await seedKb({ title: 'Quokka fact', level: 'client', clientId: IDS.clientA1, body: 'Our quokka service area is Austin.' });
    await seedKb({ title: 'Foreign', level: 'agency', agencyId: IDS.agencyB, body: 'Foreign quokka secret.' });
    const out = await search(viewer, { query: 'quokka', clientId: IDS.clientA1, types: ['knowledge'] });
    expect(ids(out).sort()).toEqual([`knowledge:${art}`, `knowledge:${fact}`].sort());
    const hit = out.results.find((r) => r.id === `knowledge:${art}`)!;
    expect(hit).toMatchObject({ title: 'Welcome to Acme Intel', url: `/kb/${art}` });
    expect(hit.snippet).toContain('Acme Intel');
    expect(hit.snippet).not.toContain('555-123-4567');
    expect(hit.snippet).not.toContain('{{');
  });

  it('leaves knowledge out of the ask channel (RF2) and serves it on mcp', async () => {
    const fact = await seedKb({ title: 'Quokka fact', level: 'client', clientId: IDS.clientA1, body: 'Our quokka service area is Austin.' });
    const asAsk = await registry.invoke(admin, 'search', { query: 'quokka', clientId: IDS.clientA1 }, { channel: 'ask' }) as Out;
    expect(ids(asAsk)).not.toContain(`knowledge:${fact}`);
    expect(await registry.invoke(admin, 'search', { query: 'quokka', clientId: IDS.clientA1, types: ['knowledge'] }, { channel: 'ask' })).toEqual({ results: [] });
    expect(ids(await search(admin, { query: 'quokka', clientId: IDS.clientA1 }))).toContain(`knowledge:${fact}`);
  });
});

describe('search under a support session', () => {
  it('embeds normally but skips embedQuery when ctx.support is set', async () => {
    const embed = vi.fn(async () => unit(0));
    const reg = withDeps({ embedQuery: embed });
    // Support sessions are web-only (registry), so both calls go over the web channel.
    const web = { channel: 'web' } as const;
    await reg.invoke(admin, 'search', { query: 'radiant floor', clientId: IDS.clientA1 }, web);
    expect(embed).toHaveBeenCalledTimes(1);
    embed.mockClear();
    await reg.invoke(supportCtx, 'search', { query: 'radiant floor', clientId: IDS.clientA1 }, web);
    expect(embed).not.toHaveBeenCalled();
  });
});
