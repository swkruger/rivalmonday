import type { RenderedPage } from '@cs/collectors';
import { kbArticle, kbChunk } from '@cs/db';
import { openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createKbJobs } from './kb';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const A1 = '00000000-0000-4000-8000-0000000000e1';
const A2 = '00000000-0000-4000-8000-0000000000e2';
const A3 = '00000000-0000-4000-8000-0000000000e3';
const base = { level: 'platform' as const, kind: 'help' as const, title: 't', bodyMd: 'b', source: 'manual' as const, status: 'published' as const, createdBy: 'u', updatedBy: 'u' };
const vec = (n: number) => Array.from({ length: 512 }, () => n);

async function chunks(articleId: string, n: number, embedded = 0) {
  await dbs.service.insert(kbChunk).values(
    Array.from({ length: n }, (_, i) => ({
      articleId, level: 'platform' as const, ord: i, text: `c${i}`,
      embedding: i < embedded ? vec(1) : null,
    })),
  );
}

function makeDeps(configured = true) {
  const embedTexts = vi.fn(async (texts: string[]) => texts.map(() => vec(0.5)));
  const deps = { engineConfigured: () => configured, serviceDb: () => dbs.service, embedTexts } as unknown as WorkerDeps;
  return { deps, embedTexts };
}
const nulls = async () => (await dbs.service.select({ id: kbChunk.id }).from(kbChunk).where(isNull(kbChunk.embedding))).length;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(kbArticle).values([{ ...base, id: A1 }, { ...base, id: A2 }, { ...base, id: A3 }]);
});

describe('kb-embed', () => {
  it('declares schema, queue and hourly cron', () => {
    const { deps } = makeDeps();
    const job = createKbJobs(deps).embed;
    expect(job.name).toBe('kb-embed');
    expect(job.cron).toBe('15 * * * *');
    expect(job.queue).toMatchObject({ policy: 'short', retryLimit: 3 });
    expect(job.schema.safeParse({}).success).toBe(true);
    expect(job.schema.safeParse({ articleId: A1 }).success).toBe(true);
    expect(job.schema.safeParse({ articleId: 'x' }).success).toBe(false);
  });

  it('embeds only chunks whose embedding is null', async () => {
    await chunks(A1, 5, 2);
    const { deps, embedTexts } = makeDeps();
    await createKbJobs(deps).embed.handler({ articleId: A1 });
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(embedTexts.mock.calls[0]![0]).toEqual(['c2', 'c3', 'c4']);
    expect(await nulls()).toBe(0);
  });

  it('limits an article job to that article', async () => {
    await chunks(A1, 2);
    await chunks(A2, 2);
    const { deps } = makeDeps();
    await createKbJobs(deps).embed.handler({ articleId: A1 });
    const rows = await dbs.service.select().from(kbChunk).where(eq(kbChunk.articleId, A2));
    expect(rows.every((r) => r.embedding === null)).toBe(true);
  });

  it('65 rows are embedded in 2 calls', async () => {
    await chunks(A1, 65);
    const { deps, embedTexts } = makeDeps();
    await createKbJobs(deps).embed.handler({ articleId: A1 });
    expect(embedTexts.mock.calls.map((c) => c[0].length)).toEqual([64, 1]);
    expect(await nulls()).toBe(0);
  });

  it('the sweep caps at 500 rows', async () => {
    await chunks(A1, 200);
    await chunks(A2, 200);
    await chunks(A3, 200);
    const { deps, embedTexts } = makeDeps();
    await createKbJobs(deps).embed.handler({});
    expect(embedTexts.mock.calls.reduce((n, c) => n + c[0].length, 0)).toBe(500);
    expect(await nulls()).toBe(100);
  });

  it('does nothing when the engine is not configured', async () => {
    await chunks(A1, 3);
    const { deps, embedTexts } = makeDeps(false);
    await createKbJobs(deps).embed.handler({});
    expect(embedTexts).not.toHaveBeenCalled();
    expect(await nulls()).toBe(3);
  });

  it('tolerates an article with no chunks and a chunk deleted mid-run', async () => {
    const { deps, embedTexts } = makeDeps();
    await createKbJobs(deps).embed.handler({ articleId: A1 });
    expect(embedTexts).not.toHaveBeenCalled();
    await chunks(A1, 2);
    embedTexts.mockImplementationOnce(async (texts: string[]) => {
      await dbs.service.execute(sql`DELETE FROM kb_chunk WHERE article_id = ${A1}`);
      return texts.map(() => vec(0.5));
    });
    await createKbJobs(deps).embed.handler({ articleId: A1 });
    expect((await dbs.service.select().from(kbChunk)).length).toBe(0);
  });
});

// ---- Phase 6c Task 6: kb-import / kb-sync ----------------------------------------------------------------------

type Fake = Partial<Pick<RenderedPage, 'status' | 'httpStatus' | 'title' | 'html' | 'error' | 'finalUrl'>>;
const HTML = '<html><head><title>Alerts guide</title></head><body><main><h1>Alerts</h1><p>They fire when a competitor changes a price.</p><ul><li>Email</li><li>Slack</li></ul></main></body></html>';

function importDeps(fake: Fake | Error, enabled = true) {
  const close = vi.fn(async () => {});
  const render = vi.fn(async (url: string) => {
    if (fake instanceof Error) throw fake;
    return { requestedUrl: url, finalUrl: url, httpStatus: 200, status: 'ok', title: 'Alerts guide', html: HTML, text: '', links: [], error: null, screenshot: async () => new Uint8Array(), close, ...fake } as RenderedPage;
  });
  const deps = { kbImportEnabled: () => enabled, politeRenderer: () => ({ render, close: async () => {} }), serviceDb: () => dbs.service } as unknown as WorkerDeps;
  return { deps, render, close };
}
const importInput = { key: 'k1', url: 'https://example.com/alerts', level: 'platform' as const, kind: 'help' as const, autoSync: 'true' as const, userId: 'op' };
const enqueueEmbed = vi.fn(async (_id: string) => {});
const run = (deps: WorkerDeps, input: Record<string, unknown> = importInput) => {
  const job = createKbJobs(deps, { enqueueEmbed }).importUrl;
  return job.handler(job.schema.parse(input));
};
const urlRows = () => dbs.service.select().from(kbArticle).where(eq(kbArticle.source, 'url'));

describe('kb-import', () => {
  it('declares a string-only schema that parses booleans back', () => {
    const job = createKbJobs(importDeps({}).deps).importUrl;
    expect(job.name).toBe('kb-import');
    expect(job.schema.parse(importInput)).toMatchObject({ autoSync: true });
    expect(job.schema.parse({ ...importInput, autoSync: 'false' })).toMatchObject({ autoSync: false });
    expect(job.schema.safeParse({ ...importInput, autoSync: true }).success).toBe(false);
  });

  it('imports a page as a draft url article and closes the page', async () => {
    const { deps, close } = importDeps({});
    const out = (await run(deps)) as { articleId: string };
    const [row] = await dbs.service.select().from(kbArticle).where(eq(kbArticle.id, out.articleId));
    expect(row).toMatchObject({ source: 'url', sourceUrl: importInput.url, status: 'draft', autoSync: true, title: 'Alerts guide' });
    expect(row!.bodyMd).toBe('# Alerts\n\nThey fire when a competitor changes a price.\n\n- Email\n- Slack');
    expect((await dbs.service.select().from(kbChunk).where(eq(kbChunk.articleId, out.articleId))).length).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('falls back to the host when the page has no title', async () => {
    const out = (await run(importDeps({ title: '  ' }).deps)) as { articleId: string };
    const [row] = await dbs.service.select().from(kbArticle).where(eq(kbArticle.id, out.articleId));
    expect(row!.title).toBe('example.com');
  });

  it.each<[string, Fake | Error, string]>([
    ['robots', { status: 'robots_disallowed' }, 'robots_disallowed'],
    ['blocked', { status: 'blocked', httpStatus: 403 }, 'blocked'],
    ['HTTP 503', { status: 'error', httpStatus: 503, error: 'HTTP 503' }, 'http_error'],
    ['off-site redirect', { status: 'error', error: 'redirected off-site to other.com' }, 'off_site'],
    ['timeout', { status: 'timeout', httpStatus: null }, 'fetch_failed'],
    ['render throws', new Error('boom'), 'fetch_failed'],
    ['empty page', { html: '<html><body><nav>x</nav></body></html>' }, 'no_content'],
  ])('%s maps to %s and saves nothing', async (_n, fake, error) => {
    const { deps, close } = importDeps(fake);
    await expect(run(deps)).resolves.toEqual({ error });
    expect(await urlRows()).toHaveLength(0);
    if (!(fake instanceof Error)) expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns disabled without fetching when the flag is off', async () => {
    const { deps, render } = importDeps({}, false);
    await expect(run(deps)).resolves.toEqual({ error: 'disabled' });
    expect(render).not.toHaveBeenCalled();
  });

  it('truncates an oversized body on a paragraph boundary', async () => {
    const para = 'x'.repeat(1000);
    const html = `<body>${Array.from({ length: 400 }, () => `<p>${para}</p>`).join('')}</body>`;
    const out = (await run(importDeps({ html }).deps)) as { articleId: string };
    const [row] = await dbs.service.select().from(kbArticle).where(eq(kbArticle.id, out.articleId));
    expect(Buffer.byteLength(row!.bodyMd)).toBeLessThanOrEqual(204_800);
    expect(row!.bodyMd.split('\n\n').every((p) => p.length === 1000)).toBe(true);
  });
});

describe('kb-sync', () => {
  const OLD = '# Old\n\nOld body text.';
  async function urlArticle(over: Partial<typeof kbArticle.$inferInsert> = {}) {
    const [r] = await dbs.service
      .insert(kbArticle)
      .values({ ...base, source: 'url', sourceUrl: 'https://example.com/alerts', autoSync: true, bodyMd: OLD, ...over })
      .returning();
    return r!;
  }
  const sync = (deps: WorkerDeps) => createKbJobs(deps, { enqueueEmbed }).sync.handler({});
  const get = async (id: string) => (await dbs.service.select().from(kbArticle).where(eq(kbArticle.id, id)))[0]!;

  beforeEach(() => enqueueEmbed.mockClear());

  it('declares the weekly cron', () => {
    const job = createKbJobs(importDeps({}).deps).sync;
    expect(job.name).toBe('kb-sync');
    expect(job.cron).toBe('0 5 * * 0');
  });

  it('a changed page keeps the previous body, rechunks and enqueues an embed', async () => {
    const a = await urlArticle();
    await chunks(a.id, 3, 3);
    await sync(importDeps({}).deps);
    const row = await get(a.id);
    expect(row.previousBodyMd).toBe(OLD);
    expect(row.bodyMd).toContain('They fire when a competitor');
    expect(row.lastSyncedAt).not.toBeNull();
    expect(row).toMatchObject({ syncFailures: 0, syncError: null });
    const cs = await dbs.service.select().from(kbChunk).where(eq(kbChunk.articleId, a.id));
    expect(cs.length).toBeGreaterThan(0);
    expect(cs.every((c) => c.embedding === null)).toBe(true);
    expect(enqueueEmbed).toHaveBeenCalledWith(a.id);
  });

  it('an unchanged page (whitespace aside) only moves the timestamp', async () => {
    const same = '# Alerts\n\nThey fire when a competitor changes a price.\n\n-  Email\n- Slack';
    const a = await urlArticle({ bodyMd: same, previousBodyMd: 'prev', syncFailures: 2, syncError: 'http_error' });
    await chunks(a.id, 2, 2);
    await sync(importDeps({}).deps);
    const row = await get(a.id);
    expect(row.bodyMd).toBe(same);
    expect(row.previousBodyMd).toBe('prev');
    expect(row.lastSyncedAt).not.toBeNull();
    expect(row).toMatchObject({ syncFailures: 0, syncError: null });
    expect((await dbs.service.select().from(kbChunk).where(eq(kbChunk.articleId, a.id))).every((c) => c.embedding !== null)).toBe(true);
    expect(enqueueEmbed).not.toHaveBeenCalled();
  });

  it('counts failures and turns auto-sync off on the third', async () => {
    const a = await urlArticle();
    const fail = importDeps({ status: 'error', httpStatus: 503, error: 'HTTP 503' }).deps;
    await sync(fail);
    await sync(fail);
    expect(await get(a.id)).toMatchObject({ syncFailures: 2, syncError: 'http_error', autoSync: true, bodyMd: OLD });
    await sync(fail);
    expect(await get(a.id)).toMatchObject({ syncFailures: 3, autoSync: false });
  });

  it('a success resets the failure count', async () => {
    const a = await urlArticle({ syncFailures: 2, syncError: 'http_error' });
    await sync(importDeps({}).deps);
    expect(await get(a.id)).toMatchObject({ syncFailures: 0, syncError: null, autoSync: true });
  });

  it('never touches draft or non-auto-sync rows (the DB forbids auto-sync on seed rows), and no-ops when disabled', async () => {
    const draft = await urlArticle({ status: 'draft' });
    const off = await urlArticle({ autoSync: false });
    const { deps, render } = importDeps({});
    await sync(deps);
    expect(render).not.toHaveBeenCalled();
    for (const r of [draft, off]) expect((await get(r.id)).bodyMd).toBe(OLD);
    const live = importDeps({}, false);
    const a = await urlArticle();
    await sync(live.deps);
    expect(live.render).not.toHaveBeenCalled();
    expect((await get(a.id)).bodyMd).toBe(OLD);
  });
});
