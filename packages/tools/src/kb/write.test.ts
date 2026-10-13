import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { kbArticle, kbChunk } from '@cs/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { saveArticle } from './write';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const BODY = '# Intro\n\nHello there.\n\n## Part\n\nMore text.';
const chunksOf = (id: string) => dbs.service.select().from(kbChunk).where(eq(kbChunk.articleId, id)).orderBy(kbChunk.ord);

describe('saveArticle', () => {
  it('publishing creates chunks that copy scope and client_visible', async () => {
    const r = await saveArticle(dbs.service, 'op', { level: 'agency', agencyId: IDS.agencyA, kind: 'help', title: 'T', bodyMd: BODY, clientVisible: false, status: 'published' });
    const rows = await chunksOf(r.id);
    expect(rows.length).toBe(r.chunkCount);
    expect(rows.length).toBeGreaterThan(0);
    for (const c of rows) expect(c).toMatchObject({ level: 'agency', agencyId: IDS.agencyA, clientId: null, clientVisible: false });
  });

  it('forces clientVisible true outside agency level', async () => {
    const r = await saveArticle(dbs.service, 'op', { level: 'client', agencyId: IDS.agencyA, clientId: IDS.clientA1, kind: 'fact', title: 'T', bodyMd: BODY, clientVisible: false, status: 'published' });
    const [a] = await dbs.service.select().from(kbArticle).where(eq(kbArticle.id, r.id));
    expect(a!.clientVisible).toBe(true);
    expect((await chunksOf(r.id))[0]).toMatchObject({ clientId: IDS.clientA1, clientVisible: true });
  });

  it('draft removes chunks; republish with an edited body replaces them', async () => {
    const base = { level: 'platform', kind: 'help', title: 'T' } as const;
    const r = await saveArticle(dbs.service, 'op', { ...base, bodyMd: BODY, status: 'published' });
    expect((await chunksOf(r.id)).length).toBeGreaterThan(0);
    await saveArticle(dbs.service, 'op', { ...base, id: r.id, bodyMd: BODY, status: 'draft' });
    expect(await chunksOf(r.id)).toHaveLength(0);
    await saveArticle(dbs.service, 'op', { ...base, id: r.id, bodyMd: '# New\n\nCompletely different words.', status: 'published' });
    const rows = await chunksOf(r.id);
    expect(rows.map((c) => c.text).join('\n')).toContain('Completely different');
    expect(rows.map((c) => c.text).join('\n')).not.toContain('Hello there');
  });

  it('moving scope copies the new scope to the chunks', async () => {
    const r = await saveArticle(dbs.service, 'op', { level: 'agency', agencyId: IDS.agencyA, kind: 'help', title: 'T', bodyMd: BODY, status: 'published' });
    await saveArticle(dbs.service, 'op', { id: r.id, level: 'client', agencyId: IDS.agencyA, clientId: IDS.clientA2, kind: 'help', title: 'T', bodyMd: BODY, status: 'published' });
    expect((await chunksOf(r.id))[0]).toMatchObject({ level: 'client', clientId: IDS.clientA2 });
  });

  it('rejects an unknown agency and a client from another agency', async () => {
    await expect(saveArticle(dbs.service, 'op', { level: 'agency', agencyId: '00000000-0000-4000-8000-0000000000ee', kind: 'help', title: 'T', bodyMd: BODY, status: 'draft' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(saveArticle(dbs.service, 'op', { level: 'client', agencyId: IDS.agencyA, clientId: IDS.clientB1, kind: 'help', title: 'T', bodyMd: BODY, status: 'draft' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('returns lint warnings and the truncation warning', async () => {
    const r = await saveArticle(dbs.service, 'op', { level: 'platform', kind: 'help', title: 'T', bodyMd: 'Ask Friday at Rival Monday.', status: 'draft' });
    expect(r.lintWarnings).toHaveLength(2);
    const big = Array.from({ length: 260 }, (_, i) => `## S${i}\n\nText ${i}.`).join('\n\n');
    const t = await saveArticle(dbs.service, 'op', { level: 'platform', kind: 'help', title: 'T', bodyMd: big, status: 'published' });
    expect(t.lintWarnings).toContain('Too long: only the first 200 sections are searchable.');
    expect(t.chunkCount).toBe(200);
  });

  it('extra sets source fields and previous_body_md keeps the prior body on edit', async () => {
    const r = await saveArticle(dbs.service, 'op', { level: 'platform', kind: 'blog', title: 'T', bodyMd: 'one', status: 'draft' }, { source: 'url', sourceUrl: 'https://x.example/a', autoSync: true });
    await saveArticle(dbs.service, 'op', { id: r.id, level: 'platform', kind: 'blog', title: 'T', bodyMd: 'two', status: 'draft' });
    const [a] = await dbs.service.select().from(kbArticle).where(eq(kbArticle.id, r.id));
    expect(a).toMatchObject({ source: 'url', sourceUrl: 'https://x.example/a', autoSync: true, bodyMd: 'two', previousBodyMd: 'one', createdBy: 'op', updatedBy: 'op' });
  });
});
