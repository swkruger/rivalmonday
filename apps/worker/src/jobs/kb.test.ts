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
