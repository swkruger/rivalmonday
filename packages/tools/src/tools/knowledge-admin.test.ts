import { createAccessContext } from '@cs/core';
import { auditLog, kbArticle, kbChunk } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { EnqueueJob } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const enqueue = vi.fn<EnqueueJob>(async () => {});
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'], enqueue });
const bare = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] });
const op = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [] });
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });

beforeEach(async () => {
  enqueue.mockClear();
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
  await seedUser(dbs.owner, 'admin', 'admin@example.com');
});

const art = { level: 'platform', kind: 'help', title: 'How alerts work', bodyMd: '# Alerts\n\nThey fire.', status: 'published' } as const;
const upsert = async (extra: object = {}) => (await registry.invoke(op, 'upsert_kb_article', { ...art, ...extra })) as { id: string; lintWarnings: string[] };
type Page = { items: { id: string; title: string; status: string }[]; nextCursor: string | null };

describe('knowledge admin tools', () => {
  it('refuses every tool to non-operators', async () => {
    const id = '00000000-0000-4000-8000-0000000000c1';
    const calls: [string, object][] = [
      ['list_kb_articles', {}],
      ['get_kb_article_admin', { id }],
      ['upsert_kb_article', art],
      ['delete_kb_article', { id }],
      ['set_kb_auto_sync', { id, autoSync: false }],
    ];
    for (const [name, input] of calls) await expect(registry.invoke(admin, name, input)).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('upsert publishes, enqueues kb-embed, and writes an audit row', async () => {
    const { id } = await upsert();
    expect(await dbs.service.select().from(kbChunk).where(eq(kbChunk.articleId, id))).not.toHaveLength(0);
    expect(enqueue).toHaveBeenCalledWith('kb-embed', { articleId: id }, `kb-embed:${id}`);
    expect(await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'upsert_kb_article'))).toHaveLength(1);
  });

  it('succeeds without enqueue and when enqueue throws', async () => {
    await expect(bare.invoke(op, 'upsert_kb_article', art)).resolves.toMatchObject({ id: expect.any(String) });
    enqueue.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(upsert()).resolves.toMatchObject({ id: expect.any(String) });
  });

  it('returns lint warnings', async () => {
    const r = await upsert({ bodyMd: 'Ask Friday.' });
    expect(r.lintWarnings).toHaveLength(1);
  });

  it('rejects a client from another agency', async () => {
    await expect(registry.invoke(op, 'upsert_kb_article', { ...art, level: 'client', agencyId: IDS.agencyA, clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('seed rows refuse update and delete', async () => {
    const [seed] = await dbs.service
      .insert(kbArticle)
      .values({ level: 'platform', kind: 'help', title: 'S', bodyMd: 'x', status: 'published', source: 'seed', seedKey: 'k1', createdBy: 'seed', updatedBy: 'seed' })
      .returning();
    await expect(registry.invoke(op, 'upsert_kb_article', { ...art, id: seed!.id })).rejects.toMatchObject({ code: 'invalid_input', message: 'Managed in repo' });
    await expect(registry.invoke(op, 'delete_kb_article', { id: seed!.id })).rejects.toMatchObject({ code: 'invalid_input', message: 'Managed in repo' });
  });

  it('list filters and pages; get returns previousBodyMd; delete removes', async () => {
    const a = await upsert();
    await upsert({ title: 'Second', status: 'draft' });
    await registry.invoke(op, 'upsert_kb_article', { ...art, id: a.id, bodyMd: 'edited body' });
    const all = (await registry.invoke(op, 'list_kb_articles', {})) as Page;
    expect(all.items).toHaveLength(2);
    const drafts = (await registry.invoke(op, 'list_kb_articles', { status: 'draft' })) as Page;
    expect(drafts.items.map((i) => i.title)).toEqual(['Second']);
    const q = (await registry.invoke(op, 'list_kb_articles', { q: 'second' })) as Page;
    expect(q.items).toHaveLength(1);
    const p1 = (await registry.invoke(op, 'list_kb_articles', { limit: 1 })) as Page;
    expect(p1.items).toHaveLength(1);
    expect(p1.nextCursor).not.toBeNull();
    const full = (await registry.invoke(op, 'get_kb_article_admin', { id: a.id })) as { previousBodyMd: string | null; bodyMd: string };
    expect(full).toMatchObject({ bodyMd: 'edited body', previousBodyMd: '# Alerts\n\nThey fire.' });
    await expect(registry.invoke(op, 'delete_kb_article', { id: a.id })).resolves.toEqual({ ok: true });
    await expect(registry.invoke(op, 'get_kb_article_admin', { id: a.id })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('set_kb_auto_sync refuses non-url articles and resets failure state when turned on', async () => {
    const a = await upsert();
    await expect(registry.invoke(op, 'set_kb_auto_sync', { id: a.id, autoSync: true })).rejects.toMatchObject({ code: 'invalid_input' });
    const [u] = await dbs.service
      .insert(kbArticle)
      .values({ level: 'platform', kind: 'blog', title: 'U', bodyMd: 'x', source: 'url', sourceUrl: 'https://x.example', syncFailures: 3, syncError: 'bad', createdBy: 'op', updatedBy: 'op' })
      .returning();
    await expect(registry.invoke(op, 'set_kb_auto_sync', { id: u!.id, autoSync: true })).resolves.toEqual({ ok: true });
    const [row] = await dbs.service.select().from(kbArticle).where(eq(kbArticle.id, u!.id));
    expect(row).toMatchObject({ autoSync: true, syncFailures: 0, syncError: null });
  });
});
