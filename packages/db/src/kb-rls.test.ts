import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { kbArticle, kbChunk } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

type Role = 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer';
const scopeFor = (agencyId: string, role: Role, clientScope: 'all' | string[] = 'all') => ({ agencyId, clientScope, userId: 'u1', role });

const A = (n: number) => `00000000-0000-4000-8000-0000000000d${n}`;
const base = { kind: 'help' as const, bodyMd: 'body', source: 'manual' as const, createdBy: 'u', updatedBy: 'u' };

async function seedKb() {
  const rows = [
    { id: A(1), level: 'platform' as const, title: 'plat', status: 'published' as const },
    { id: A(2), level: 'platform' as const, title: 'plat-draft', status: 'draft' as const },
    { id: A(3), level: 'agency' as const, agencyId: IDS.agencyA, title: 'ag-visible', status: 'published' as const, clientVisible: true },
    { id: A(4), level: 'agency' as const, agencyId: IDS.agencyA, title: 'ag-hidden', status: 'published' as const, clientVisible: false },
    { id: A(5), level: 'client' as const, agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 'cl-a1', status: 'published' as const },
    { id: A(6), level: 'agency' as const, agencyId: IDS.agencyB, title: 'ag-b', status: 'published' as const },
  ];
  await dbs.service.insert(kbArticle).values(rows.map((r) => ({ ...base, ...r })));
  await dbs.service.insert(kbChunk).values(
    rows.map((r, i) => ({
      articleId: r.id,
      level: r.level,
      agencyId: 'agencyId' in r ? r.agencyId : null,
      clientId: 'clientId' in r ? r.clientId : null,
      clientVisible: 'clientVisible' in r ? r.clientVisible : true,
      ord: 0,
      text: `chunk ${r.title} ${i}`,
    })),
  );
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedKb();
});

const titles = (scope: ReturnType<typeof scopeFor>) =>
  withTenant(dbs.app, scope, async (tx) => ({
    articles: (await tx.select({ t: kbArticle.title }).from(kbArticle)).map((r) => r.t).sort(),
    chunks: (await tx.select({ id: kbChunk.articleId }).from(kbChunk)).map((r) => r.id).sort(),
  }));

describe('kb RLS', () => {
  it('platform published row is visible to any agency user; a draft is not', async () => {
    for (const agency of [IDS.agencyA, IDS.agencyB]) {
      const r = await titles(scopeFor(agency, 'agency_admin'));
      expect(r.articles).toContain('plat');
      expect(r.articles).not.toContain('plat-draft');
      expect(r.chunks).toContain(A(1));
    }
  });

  it('agency row: own admin sees it, another agency does not', async () => {
    const a = await titles(scopeFor(IDS.agencyA, 'agency_admin'));
    expect(a.articles).toEqual(['ag-hidden', 'ag-visible', 'cl-a1', 'plat']);
    const b = await titles(scopeFor(IDS.agencyB, 'agency_admin'));
    expect(b.articles).toEqual(['ag-b', 'plat']);
  });

  it('client_owner sees client_visible agency rows only; account_manager sees both', async () => {
    const owner = await titles(scopeFor(IDS.agencyA, 'client_owner'));
    expect(owner.articles).toContain('ag-visible');
    expect(owner.articles).not.toContain('ag-hidden');
    expect(owner.chunks).not.toContain(A(4));
    const viewer = await titles(scopeFor(IDS.agencyA, 'client_viewer'));
    expect(viewer.articles).not.toContain('ag-hidden');
    const am = await titles(scopeFor(IDS.agencyA, 'account_manager'));
    expect(am.articles).toContain('ag-hidden');
    expect(am.chunks).toContain(A(4));
  });

  it('client row: scoped to A1 sees it; scoped elsewhere or other agency does not', async () => {
    expect((await titles(scopeFor(IDS.agencyA, 'client_owner', [IDS.clientA1]))).articles).toContain('cl-a1');
    const other = await titles(scopeFor(IDS.agencyA, 'client_owner', [IDS.clientA2]));
    expect(other.articles).not.toContain('cl-a1');
    expect(other.chunks).not.toContain(A(5));
    expect((await titles(scopeFor(IDS.agencyB, 'agency_admin'))).articles).not.toContain('cl-a1');
  });

  it('app_user cannot INSERT, UPDATE or DELETE on either table', async () => {
    const scope = scopeFor(IDS.agencyA, 'agency_admin');
    const errs = await Promise.all([
      errorText(withTenant(dbs.app, scope, (tx) => tx.insert(kbArticle).values({ ...base, level: 'platform', title: 'x' }))),
      errorText(withTenant(dbs.app, scope, (tx) => tx.update(kbArticle).set({ title: 'y' }).where(eq(kbArticle.id, A(1))))),
      errorText(withTenant(dbs.app, scope, (tx) => tx.delete(kbArticle).where(eq(kbArticle.id, A(1))))),
      errorText(withTenant(dbs.app, scope, (tx) => tx.insert(kbChunk).values({ articleId: A(1), level: 'platform', ord: 5, text: 'x' }))),
      errorText(withTenant(dbs.app, scope, (tx) => tx.update(kbChunk).set({ text: 'y' }).where(eq(kbChunk.articleId, A(1))))),
      errorText(withTenant(dbs.app, scope, (tx) => tx.delete(kbChunk).where(eq(kbChunk.articleId, A(1))))),
    ]);
    for (const e of errs) expect(e).toMatch(/permission denied/);
  });

  it('CHECK rejects a platform row with agency_id', async () => {
    const err = await errorText(dbs.service.insert(kbArticle).values({ ...base, level: 'platform', agencyId: IDS.agencyA, title: 'x' }));
    expect(err).toMatch(/kb_article_scope_check|check constraint/);
  });

  it("composite FK rejects a client row whose agency differs from the client's agency", async () => {
    const err = await errorText(
      dbs.service.insert(kbArticle).values({ ...base, level: 'client', agencyId: IDS.agencyB, clientId: IDS.clientA1, title: 'x' }),
    );
    expect(err).toMatch(/foreign key/);
  });

  it('search_tsv generated column matches chunk text', async () => {
    const r = (await dbs.service.execute(sql`select count(*)::int as n from kb_chunk where search_tsv @@ websearch_to_tsquery('english', 'plat')`)) as unknown as { n: number }[];
    
    expect(Number(r[0]!.n)).toBeGreaterThan(0);
  });
});
