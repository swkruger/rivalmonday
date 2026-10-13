import { agency, alert, brief, briefItem, captureBlock, client, kbArticle, kbChunk, recommendation } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { createPackLoader } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import { fetchItem, ITEM_TYPES, parseItemId } from '../search/fetch-item';
import { ctx, dbs, resetWorkspace, seedCapture, seedEvent, seedPage, seedReview } from './workspace-fixtures';

type Out = { id: string; title: string; text: string; url: string; metadata: { type: string; client_id: string; evidence_ids: string[]; occurred_at?: string } };

const U = '0b6c8a52-3f0e-4d7a-9c1b-2e4f6a8b0c1d';
const admin = ctx('agency_admin', 'all');
const viewer = ctx('client_viewer', [IDS.clientA1], ['dashboard', 'mcp']);
const mcp = { channel: 'mcp' as const, tokenId: 'pat-1', tokenScope: 'read' as const };
const store = new Map<string, Uint8Array>();
const baseDeps: ToolDeps = { app: dbs.app, service: dbs.service, packs: createPackLoader(), evidenceStore: { get: async (k) => store.get(k) ?? null } };
const reg = (extra: Partial<ToolDeps> = {}) => createToolRegistry({ ...baseDeps, ...extra }, { audit: { record: async () => {} } });
const registry = reg();

const doFetch = (c: typeof admin, id: string, r = registry) => r.invoke(c, 'fetch', { id }, mcp) as Promise<Out>;
const notFound = { code: 'not_found', message: 'Not found' };

const period = { periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z') };
async function seedBrief(o: { status: string; clientId?: string; agencyId?: string; deliveryDate?: string }): Promise<string> {
  const [b] = await dbs.owner.insert(brief).values({
    agencyId: o.agencyId ?? IDS.agencyA, clientId: o.clientId ?? IDS.clientA1, ...period, deliveryDate: o.deliveryDate ?? '2026-10-05', status: o.status, summary: 'Quiet week overall.',
  }).returning();
  return b!.id;
}
async function seedItem(briefId: string, ord: number, headline: string, status = 'active', evidenceIds: string[] = []): Promise<string> {
  const [i] = await dbs.owner.insert(briefItem).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId, ord, competitorId: IDS.competitorX, headline, whatChanged: `${headline} changed`,
    whyItMatters: 'It matters', recommendedAction: 'Respond', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds, status, upsellTag: 'seo_audit',
  }).returning();
  return i!.id;
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

beforeEach(async () => {
  store.clear();
  await resetWorkspace();
});

describe('parseItemId', () => {
  it('parseItemId accepts each type and rejects junk, uppercase types, extra segments', () => {
    for (const t of ITEM_TYPES) expect(parseItemId(`${t}:${U}`)).toEqual({ type: t, uuid: U });
    expect(parseItemId(`event:${U.toUpperCase()}`)).toEqual({ type: 'event', uuid: U });
    for (const bad of ['junk', '', U, `EVENT:${U}`, `Event:${U}`, `event:${U}:x`, `event:${U}x`, 'event:not-a-uuid', `:${U}`, 'event:', `move:${U}`, `event::${U}`, ` event:${U}`]) {
      expect(parseItemId(bad), bad).toBeNull();
    }
  });
});

describe('fetch', () => {
  it('fetches an event with its summary, facts, evidence and link', async () => {
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC cut its AC tune-up to $79', facts: [{ kind: 'price', before: { raw: '$99' } as never, after: { raw: '$79' } as never, pct: -20.2 }] });
    const out = await doFetch(viewer, `event:${ev.eventId}`);
    expect(out).toMatchObject({ id: `event:${ev.eventId}`, title: 'Smith HVAC: Price change', url: `/c/${IDS.clientA1}/changes?event=${ev.eventId}` });
    expect(out.text).toContain('Smith HVAC cut its AC tune-up to $79');
    expect(out.text).toContain('$99 → $79');
    expect(out.metadata).toMatchObject({ type: 'event', client_id: IDS.clientA1, evidence_ids: [] });
    expect(out.metadata.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('fetch of an event scored only for another client is not_found', async () => {
    // B1 (agency B) also tracks Smith HVAC, but the event is scored for B1 only.
    const theirs = await seedEvent({ score: 90, route: 'alert', ageDays: 1, agencyId: IDS.agencyB, clientId: IDS.clientB1 });
    await expect(doFetch(admin, `event:${theirs.eventId}`)).rejects.toMatchObject(notFound);
    await expect(doFetch(viewer, `event:${theirs.eventId}`)).rejects.toMatchObject(notFound);
    const bAdmin = ctx('agency_admin', 'all', [], IDS.agencyB);
    expect((await doFetch(bAdmin, `event:${theirs.eventId}`)).metadata.client_id).toBe(IDS.clientB1);
    // A client role without the dashboard feature sees no events at all.
    const mine = await seedEvent({ score: 80, route: 'alert', ageDays: 1 });
    await expect(doFetch(ctx('client_viewer', [IDS.clientA1], ['mcp']), `event:${mine.eventId}`)).rejects.toMatchObject(notFound);
  });

  it('retracted event not_found', async () => {
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, retracted: true });
    await expect(doFetch(admin, `event:${ev.eventId}`)).rejects.toMatchObject(notFound);
  });

  it("other agency's brief not_found with identical message to malformed id", async () => {
    const theirs = await seedBrief({ status: 'sent', agencyId: IDS.agencyB, clientId: IDS.clientB1 });
    const errOf = (p: Promise<unknown>) => p.then(() => null, (e: { code: string; message: string }) => ({ code: e.code, message: e.message }));
    const hidden = await errOf(doFetch(admin, `brief:${theirs}`));
    expect(hidden).toEqual(notFound);
    expect(await errOf(doFetch(admin, 'brief:nope'))).toEqual(hidden);
    expect(await errOf(doFetch(admin, `brief:${U}`))).toEqual(hidden);
    expect(await errOf(doFetch(admin, `widget:${U}`))).toEqual(hidden);
    // fetchItem itself refuses a non-uuid id the same way (resources pass raw ids).
    await expect(fetchItem(baseDeps, admin, 'brief', 'nope')).rejects.toMatchObject(notFound);
  });

  it('client role: ready brief not_found, sent brief text sorted by ord, no upsell', async () => {
    const ready = await seedBrief({ status: 'ready', deliveryDate: '2026-10-12' });
    await seedItem(ready, 1, 'Ready headline');
    await expect(doFetch(viewer, `brief:${ready}`)).rejects.toMatchObject(notFound);
    expect((await doFetch(admin, `brief:${ready}`)).text).toContain('Ready headline');

    const sent = await seedBrief({ status: 'sent' });
    await seedItem(sent, 5, 'Second headline', 'active', ['e2', 'e1']);
    await seedItem(sent, 2, 'First headline', 'active', ['e1']);
    await seedItem(sent, 3, 'Dropped headline', 'dropped', ['e9']);
    const out = await doFetch(viewer, `brief:${sent}`);
    expect(out).toMatchObject({ id: `brief:${sent}`, title: 'Weekly brief 2026-10-05', url: `/go/brief/${sent}` });
    expect(out.text).toContain('Quiet week overall.');
    expect(out.text.indexOf('First headline')).toBeLessThan(out.text.indexOf('Second headline'));
    expect(out.text).toContain('What changed: First headline changed');
    expect(out.text).not.toContain('Dropped headline');
    expect(JSON.stringify(out)).not.toContain('seo_audit');
    expect(out.metadata).toMatchObject({ type: 'brief', client_id: IDS.clientA1, evidence_ids: ['e1', 'e2'] });
  });

  it('dropped brief item not_found', async () => {
    const sent = await seedBrief({ status: 'sent' });
    const dropped = await seedItem(sent, 1, 'Dropped headline', 'dropped');
    const active = await seedItem(sent, 2, 'Active headline', 'active', ['e1']);
    await expect(doFetch(admin, `brief_item:${dropped}`)).rejects.toMatchObject(notFound);
    await expect(doFetch(viewer, `brief_item:${dropped}`)).rejects.toMatchObject(notFound);
    const out = await doFetch(viewer, `brief_item:${active}`);
    expect(out).toMatchObject({ title: 'Active headline', url: `/go/brief_item/${active}`, metadata: { type: 'brief_item', client_id: IDS.clientA1, evidence_ids: ['e1'] } });
    expect(out.text).toContain('Recommended action: Respond');
    expect(JSON.stringify(out)).not.toContain('seo_audit');
    // An item of a ready brief is hidden from client roles.
    const ready = await seedBrief({ status: 'ready', deliveryDate: '2026-10-12' });
    const readyItem = await seedItem(ready, 1, 'Ready headline');
    await expect(doFetch(viewer, `brief_item:${readyItem}`)).rejects.toMatchObject(notFound);
  });

  it('undelivered alert not_found for client role', async () => {
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1 });
    const [a] = await dbs.owner.insert(alert).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: ev.eventId, score: 82, headline: 'Smith HVAC price cut', body: 'Smith HVAC moved.', status: 'pending_review', mode: 'after_am_check', evidenceIds: ['e1'],
    }).returning();
    await expect(doFetch(viewer, `alert:${a!.id}`)).rejects.toMatchObject(notFound);
    const out = await doFetch(admin, `alert:${a!.id}`);
    expect(out).toMatchObject({ title: 'Smith HVAC price cut', text: 'Smith HVAC moved.', url: `/go/alert/${a!.id}`, metadata: { type: 'alert', client_id: IDS.clientA1, evidence_ids: ['e1'] } });
  });

  it('fetches a recommendation without its upsell tag; prospect client not_found', async () => {
    const [r] = await dbs.owner.insert(recommendation).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 'Match the tune-up price', rationale: 'Smith HVAC undercuts you.', effort: 'L', impact: 'H', owner: 'client', source: 'brief', upsellTag: 'ppc', evidenceIds: ['e1'],
    }).returning();
    const out = await doFetch(viewer, `recommendation:${r!.id}`);
    expect(out).toMatchObject({ title: 'Match the tune-up price', url: `/c/${IDS.clientA1}/recommendations`, metadata: { type: 'recommendation', client_id: IDS.clientA1, evidence_ids: ['e1'] } });
    expect(out.text).toContain('Smith HVAC undercuts you.');
    expect(out.text).toContain('Status: To do');
    expect(out.text).toContain('Effort: Low');
    expect(JSON.stringify(out)).not.toContain('ppc');
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    await expect(doFetch(admin, `recommendation:${r!.id}`)).rejects.toMatchObject(notFound);
  });

  it('evidence text redacts an email address', async () => {
    const cap = await seedCapture({ kinds: ['text', 'screenshot'] });
    store.set(cap.objectKeys.text!, new TextEncoder().encode('Call our office at bob.jones@example.com for a quote.'));
    const out = await doFetch(viewer, `evidence:${cap.ids.text}`);
    expect(out.text).toContain('for a quote');
    expect(out.text).not.toContain('bob.jones@example.com');
    expect(out).toMatchObject({ url: `/c/${IDS.clientA1}/evidence/${cap.ids.text}`, metadata: { type: 'evidence', client_id: IDS.clientA1, evidence_ids: [cap.ids.text] } });
    // A briefs-only client (no dashboard) can still fetch evidence (decision 7).
    expect((await doFetch(ctx('client_viewer', [IDS.clientA1], ['mcp']), `evidence:${cap.ids.text}`)).text).toContain('for a quote');
    // Screenshots: a description line, and the object key only through fetchItem.
    const shot = await doFetch(admin, `evidence:${cap.ids.screenshot}`);
    expect(shot.text).toMatch(/^Screenshot of https:\/\/smithhvac\.example\/pricing captured \d{4}-\d{2}-\d{2}/);
    expect(JSON.stringify(shot)).not.toContain('screenshotKey');
    expect((await fetchItem(baseDeps, admin, 'evidence', cap.ids.screenshot!)).screenshotKey).toBe(cap.objectKeys.screenshot);
    // Not configured → internal.
    await expect(doFetch(admin, `evidence:${cap.ids.text}`, reg({ evidenceStore: undefined }))).rejects.toMatchObject({ code: 'internal' });
  });

  it('caps evidence text at 20,000 characters', async () => {
    const cap = await seedCapture({ kinds: ['text'] });
    store.set(cap.objectKeys.text!, new TextEncoder().encode('word '.repeat(10_000)));
    expect((await doFetch(admin, `evidence:${cap.ids.text}`)).text.length).toBeLessThanOrEqual(20_000);
  });

  it('html evidence returns no markup', async () => {
    const cap = await seedCapture({ kinds: ['html', 'vendor_json'] });
    store.set(cap.objectKeys.html!, new TextEncoder().encode('<html><script>alert(1)</script><p>Secret</p></html>'));
    for (const id of [cap.ids.html!, cap.ids.vendor_json!]) {
      const out = await doFetch(admin, `evidence:${id}`);
      expect(out.text).not.toMatch(/[<>]/);
      expect(out.text).not.toContain('Secret');
      expect(out.metadata.evidence_ids).toEqual([id]);
    }
  });

  it("evidence of a competitor this agency never linked is not_found", async () => {
    // Bright Smiles (Y) is tracked by A2 only; agency B cannot see its evidence.
    const cap = await seedCapture({ competitorId: IDS.competitorY, kinds: ['text'] });
    store.set(cap.objectKeys.text!, new TextEncoder().encode('Y text'));
    await expect(doFetch(ctx('agency_admin', 'all', [], IDS.agencyB), `evidence:${cap.ids.text}`)).rejects.toMatchObject(notFound);
    await expect(doFetch(viewer, `evidence:${cap.ids.text}`)).rejects.toMatchObject(notFound);
  });

  it('agency with two clients resolves the visible one', async () => {
    // Y is tracked by A2 only: A1 ('A1 HVAC') sorts first but cannot see it.
    const ev = await seedEvent({ score: 70, route: 'brief', ageDays: 2, competitorId: IDS.competitorY, clientId: IDS.clientA2, summary: 'Bright Smiles opened a new office' });
    const out = await doFetch(admin, `event:${ev.eventId}`);
    expect(out.metadata.client_id).toBe(IDS.clientA2);
    expect(out.url).toBe(`/c/${IDS.clientA2}/changes?event=${ev.eventId}`);
    const yPage = ev.pageId;
    expect((await doFetch(admin, `page:${yPage}`)).metadata.client_id).toBe(IDS.clientA2);
    // A2 becomes a prospect: nobody active in scope can see it.
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    await expect(doFetch(admin, `event:${ev.eventId}`)).rejects.toMatchObject(notFound);
    await expect(doFetch(admin, `page:${yPage}`)).rejects.toMatchObject(notFound);
  });

  it('fetches a review with its owner answer and never the reviewer hash', async () => {
    const id = await seedReview({ rating: 4, text: 'Tech was on time. Email me at pat@example.com', ownerAnswer: 'Thanks!' });
    const out = await doFetch(viewer, `review:${id}`);
    expect(out).toMatchObject({ title: 'Smith HVAC review, 4★', url: `/c/${IDS.clientA1}/reviews`, metadata: { type: 'review', client_id: IDS.clientA1 } });
    expect(out.text).toContain('Rating: 4/5');
    expect(out.text).toContain('Tech was on time.');
    expect(out.text).toContain('Owner answer: Thanks!');
    expect(out.text).not.toContain('pat@example.com');
    expect(JSON.stringify(out)).not.toContain('hash-secret');
    const yReview = await seedReview({ competitorId: IDS.competitorY });
    await expect(doFetch(viewer, `review:${yReview}`)).rejects.toMatchObject(notFound);
  });

  it("fetches a page's latest capture blocks by ord", async () => {
    const page = await seedPage({ url: 'https://smithhvac.example/services' });
    const old = await seedCapture({ pageId: page, at: new Date(Date.now() - 86_400_000), kinds: ['text'] });
    const latest = await seedCapture({ pageId: page, kinds: ['text', 'screenshot'] });
    const block = (captureId: string, ord: number, text: string) => ({ captureId, competitorId: IDS.competitorX, trackedPageId: page, ord, blockKey: `b${ord}`, path: 'main', text, textSha: `s${ord}` });
    await dbs.owner.insert(captureBlock).values([block(old.captureId, 0, 'Old block'), block(latest.captureId, 1, 'Second block'), block(latest.captureId, 0, 'First block call 555-123-4567')]);
    const out = await doFetch(viewer, `page:${page}`);
    expect(out).toMatchObject({ title: 'Smith HVAC: /services', url: `/c/${IDS.clientA1}/competitors/${IDS.competitorX}`, metadata: { type: 'page', client_id: IDS.clientA1 } });
    expect(out.text.indexOf('First block')).toBeLessThan(out.text.indexOf('Second block'));
    expect(out.text).not.toContain('Old block');
    expect(out.text).not.toContain('555-123-4567');
    expect([...out.metadata.evidence_ids].sort()).toEqual([latest.ids.text, latest.ids.screenshot].sort());
  });

  it('fetches a knowledge article rendered with the agency product name (RF3) and redacted', async () => {
    await dbs.owner.update(agency).set({ branding: { displayName: 'Acme Intel' } as never }).where(eq(agency.id, IDS.agencyA));
    const id = await seedKb({ title: '{{product}} guide', body: 'Welcome to {{product}}. Call 555-123-4567.' });
    const out = await doFetch(viewer, `knowledge:${id}`);
    expect(out).toMatchObject({ id: `knowledge:${id}`, title: 'Acme Intel guide', url: `/kb/${id}`, metadata: { type: 'knowledge', client_id: '', evidence_ids: [] } });
    expect(out.text).toContain('Welcome to Acme Intel.');
    expect(out.text).not.toContain('555-123-4567');
    const fact = await seedKb({ level: 'client', clientId: IDS.clientA1, body: 'Fact body' });
    expect((await doFetch(viewer, `knowledge:${fact}`)).metadata.client_id).toBe(IDS.clientA1);
  });

  it('refuses knowledge ids on the ask channel (RF2) but serves them on mcp', async () => {
    const id = await seedKb({ level: 'client', clientId: IDS.clientA1, body: 'Fact body' });
    await expect(registry.invoke(admin, 'fetch', { id: `knowledge:${id}` }, { channel: 'ask' })).rejects.toMatchObject(notFound);
    expect((await doFetch(admin, `knowledge:${id}`)).metadata.type).toBe('knowledge');
  });

  it('answers not_found for a cross-agency, draft or unknown knowledge id', async () => {
    const foreign = await seedKb({ level: 'agency', agencyId: IDS.agencyB, body: 'secret' });
    const draft = await seedKb({ body: 'draft' });
    await dbs.owner.update(kbArticle).set({ status: 'draft' }).where(eq(kbArticle.id, draft));
    await expect(doFetch(admin, `knowledge:${foreign}`)).rejects.toMatchObject(notFound);
    await expect(doFetch(admin, `knowledge:${draft}`)).rejects.toMatchObject(notFound);
    await expect(doFetch(admin, `knowledge:${U}`)).rejects.toMatchObject(notFound);
  });

  it('answers not_found for an agency article hidden from clients and for a sibling client-level article', async () => {
    const hidden = await seedKb({ body: 'internal only' });
    await dbs.owner.update(kbArticle).set({ clientVisible: false }).where(eq(kbArticle.id, hidden));
    await dbs.owner.update(kbChunk).set({ clientVisible: false }).where(eq(kbChunk.articleId, hidden));
    const sibling = await seedKb({ level: 'client', clientId: IDS.clientA2, body: 'other client fact' });
    await expect(doFetch(viewer, `knowledge:${hidden}`)).rejects.toMatchObject(notFound);
    await expect(doFetch(viewer, `knowledge:${sibling}`)).rejects.toMatchObject(notFound);
    expect((await doFetch(admin, `knowledge:${hidden}`)).metadata.type).toBe('knowledge');
  });
});
