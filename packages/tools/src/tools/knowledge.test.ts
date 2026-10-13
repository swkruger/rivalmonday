import { createAccessContext } from '@cs/core';
import { agency, EMBEDDING_DIMENSIONS, kbArticle, kbChunk } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import { ctx, dbs, registry, resetWorkspace } from './workspace-fixtures';

type Out = { results: { kbId: string; title: string; kind: string; level: string; updatedAt: string; chunks: string[] }[] };
const web = { channel: 'web' as const };
const ask = { channel: 'ask' as const };
const admin = ctx('agency_admin', 'all');
const viewer = ctx('client_viewer', [IDS.clientA1], ['dashboard', 'ask']);
const unit = (i: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, j) => (j === i ? 1 : 0));
const mix = (d0: number, d1: number) => unit(0).map((_, j) => (j === 0 ? d0 : j === 1 ? d1 : 0));
const withDeps = (extra: Partial<ToolDeps>) => createToolRegistry({ app: dbs.app, service: dbs.service, ...extra }, { audit: { record: async () => {} } });

const supportCtx = createAccessContext({ agencyId: IDS.agencyA, userId: 'op-1', role: 'agency_admin', clientScope: 'all', features: [], support: { sessionId: '00000000-0000-4000-8000-000000000001', platformUserId: 'op-1' } });

interface Seed {
  title?: string;
  level?: 'platform' | 'agency' | 'client';
  agencyId?: string | null;
  clientId?: string | null;
  kind?: 'help' | 'fact' | 'qa';
  status?: 'draft' | 'published';
  clientVisible?: boolean;
  body?: string;
  chunks: string[];
  vectors?: number[][];
}
async function seed(s: Seed): Promise<string> {
  const level = s.level ?? 'platform';
  const agencyId = s.agencyId !== undefined ? s.agencyId : level === 'platform' ? null : IDS.agencyA;
  const clientId = s.clientId !== undefined ? s.clientId : null;
  const [a] = await dbs.owner.insert(kbArticle).values({
    level, agencyId, clientId, kind: s.kind ?? 'help', title: s.title ?? 'Article', bodyMd: s.body ?? s.chunks.join('\n\n'), status: s.status ?? 'published',
    clientVisible: s.clientVisible ?? true, source: 'manual', createdBy: 't', updatedBy: 't',
  }).returning();
  await dbs.owner.insert(kbChunk).values(s.chunks.map((text, ord) => ({
    articleId: a!.id, level, agencyId, clientId, clientVisible: s.clientVisible ?? true, ord, text, embedding: s.vectors?.[ord] ?? null,
  })));
  return a!.id;
}
const search = (c: typeof admin, input: Record<string, unknown>, reg = registry, meta: typeof web | typeof ask = web) => reg.invoke(c, 'search_knowledge', input, meta) as Promise<Out>;
const ids = (o: Out) => o.results.map((r) => r.kbId);

beforeEach(resetWorkspace);

describe('search_knowledge', () => {
  it('ranks by full text alone when embedQuery is absent', async () => {
    const weak = await seed({ title: 'Weak', chunks: ['The dashboard shows alerts once.'] });
    const strong = await seed({ title: 'Strong', chunks: ['Alerts alerts alerts: how alerts fire and alerts are delivered.'] });
    await seed({ title: 'Other', chunks: ['Nothing relevant here at all.'] });
    expect(ids(await search(admin, { query: 'alerts' }))).toEqual([strong, weak]);
  });

  it('fuses vector and full-text order with a stub embedQuery', async () => {
    const a = await seed({ title: 'A', chunks: ['pricing pricing pricing page'], vectors: [mix(0.1, 0.995)] });
    const b = await seed({ title: 'B', chunks: ['pricing mention'], vectors: [unit(0)] });
    const c = await seed({ title: 'C', chunks: ['unrelated words'], vectors: [mix(0.8, 0.6)] }); // vector-only hit
    const reg = withDeps({ embedQuery: async () => unit(0) });
    const out = await search(admin, { query: 'pricing' }, reg);
    // Query vector is unit(0); cosine distances are B 0, C 0.2, A ~0.9 (no ties). B: fts 2 + vector 1 = .0325; A: fts 1 + vector 3 = .0323; C: vector 2 = .0161.
    expect(ids(out)).toEqual([b, a, c]);
  });

  it('falls back to full text when embedQuery throws', async () => {
    const a = await seed({ chunks: ['pricing details'] });
    const reg = withDeps({ embedQuery: async () => { throw new Error('down'); } });
    expect(ids(await search(admin, { query: 'pricing' }, reg))).toEqual([a]);
  });

  it('returns at most 2 chunks per article and honours limit and kinds', async () => {
    const a = await seed({ title: 'Many', chunks: ['review one review', 'review two review', 'review three review'] });
    await seed({ title: 'Fact', kind: 'fact', chunks: ['review fact'] });
    const out = await search(admin, { query: 'review' });
    expect(out.results.find((r) => r.kbId === a)!.chunks).toHaveLength(2);
    expect((await search(admin, { query: 'review', limit: 1 })).results).toHaveLength(1);
    expect((await search(admin, { query: 'review', kinds: ['fact'] })).results.map((r) => r.kind)).toEqual(['fact']);
  });

  it('RF1: a client role never sees a client_visible=false agency article', async () => {
    const hidden = await seed({ level: 'agency', clientVisible: false, chunks: ['internal margin playbook'] });
    const shown = await seed({ level: 'agency', clientVisible: true, chunks: ['public margin playbook'] });
    expect(ids(await search(viewer, { query: 'playbook' }))).toEqual([shown]);
    expect(ids(await search(admin, { query: 'playbook' }))).toEqual(expect.arrayContaining([hidden, shown]));
  });

  it('RF2: client facts only for the requested, visible client', async () => {
    const a1 = await seed({ level: 'client', clientId: IDS.clientA1, kind: 'fact', chunks: ['A1 opens at 7am'] });
    const a2 = await seed({ level: 'client', clientId: IDS.clientA2, kind: 'fact', chunks: ['A2 opens at 9am'] });
    const plat = await seed({ chunks: ['opens help article'] });
    expect(ids(await search(admin, { query: 'opens', clientId: IDS.clientA1 })).sort()).toEqual([a1, plat].sort());
    expect(ids(await search(admin, { query: 'opens' }))).toEqual([plat]);
    expect(ids(await search(admin, { query: 'opens', clientId: IDS.clientA2 })).sort()).toEqual([a2, plat].sort());
  });

  it('RF3: white-label names replace the placeholders; no literal placeholder or default leaks', async () => {
    await dbs.owner.update(agency).set({ branding: { displayName: 'Acme Intel', assistantName: 'Ace' } as never }).where(eq(agency.id, IDS.agencyA));
    await seed({ title: 'About', chunks: ['{{product}} is guided by {{assistant}} for onboarding.'] });
    const out = await search(admin, { query: 'onboarding' });
    expect(out.results[0]!.chunks[0]).toBe('Acme Intel is guided by Ace for onboarding.');
    expect(out.results[0]!.chunks[0]).not.toMatch(/\{\{|Rival Monday|Friday/);
    await dbs.owner.update(agency).set({ branding: {} as never }).where(eq(agency.id, IDS.agencyA));
    expect((await search(admin, { query: 'onboarding' })).results[0]!.chunks[0]).toBe('Rival Monday is guided by Friday for onboarding.');
  });

  it('redacts contact details on ask, not on web', async () => {
    await seed({ chunks: ['Escalations go to ops@example.com for billing.'] });
    expect((await search(admin, { query: 'billing' }, registry, ask)).results[0]!.chunks[0]).not.toContain('ops@example.com');
    expect((await search(admin, { query: 'billing' })).results[0]!.chunks[0]).toContain('ops@example.com');
  });

  it('excludes drafts and other agencies; a non-visible clientId is not_found', async () => {
    await seed({ status: 'draft', chunks: ['draft sprocket'] });
    await seed({ level: 'agency', agencyId: IDS.agencyB, chunks: ['foreign sprocket'] });
    expect((await search(admin, { query: 'sprocket' })).results).toEqual([]);
    await expect(search(admin, { query: 'sprocket', clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(search(viewer, { query: 'sprocket', clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_kb_article', () => {
  const get = (c: typeof admin, kbId: string) =>
    registry.invoke(c, 'get_kb_article', { kbId }, web) as Promise<{ kbId: string; title: string; bodyMd: string; sourceUrl: string | null; level: string }>;

  it('returns a rendered body for a visible article', async () => {
    const id = await seed({ title: 'T', body: '# Hi\n\nWelcome to {{product}}.', chunks: ['Welcome'] });
    expect(await get(viewer, id)).toMatchObject({ kbId: id, title: 'T', level: 'platform', bodyMd: '# Hi\n\nWelcome to Rival Monday.', sourceUrl: null });
  });

  it('not_found for draft, foreign, hidden and unknown ids', async () => {
    const draft = await seed({ status: 'draft', chunks: ['x'] });
    const foreign = await seed({ level: 'agency', agencyId: IDS.agencyB, chunks: ['x'] });
    const hidden = await seed({ level: 'agency', clientVisible: false, chunks: ['x'] });
    for (const id of [draft, foreign, '00000000-0000-4000-8000-0000000000c9']) await expect(get(admin, id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(get(viewer, hidden)).rejects.toMatchObject({ code: 'not_found' });
    expect((await get(admin, hidden)).kbId).toBe(hidden);
  });
});

describe('search_knowledge under a support session', () => {
  it('embeds normally but skips embedQuery when ctx.support is set', async () => {
    await seed({ title: 'A', chunks: ['pricing pricing page'], vectors: [unit(0)] });
    let calls = 0;
    const reg = withDeps({ embedQuery: async () => { calls++; return unit(0); } });
    await search(admin, { query: 'pricing' }, reg);
    expect(calls).toBe(1);
    const out = await search(supportCtx, { query: 'pricing' }, reg);
    expect(calls).toBe(1);
    expect(out.results).toHaveLength(1); // still found by full text
  });
});
