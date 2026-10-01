import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { SourceKind } from '@cs/collectors';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { competitor, competitorSource, createDb, trackedPage } = await import('@cs/db');
const { ensureCompetitorSources } = await import('@cs/collectors');
const { and, eq, inArray, sql } = await import('drizzle-orm');
const { createWorkerDeps } = await import('../deps');

const { values } = parseArgs({
  options: {
    domain: { type: 'string' },
    name: { type: 'string' },
    'place-id': { type: 'string' },
    cid: { type: 'string' },
    'meta-page-id': { type: 'string' },
    vendors: { type: 'boolean', default: false },
    web: { type: 'boolean', default: false },
    poll: { type: 'boolean', default: false },
  },
});

const USAGE =
  'Usage: pnpm --filter @cs/worker collect-once --domain example.com [--name "Example Co"] [--place-id <id>] [--cid <id>] [--meta-page-id <id>] [--vendors] [--web]\n' +
  '   or: pnpm --filter @cs/worker collect-once --poll';

const serviceUrl = process.env.SERVICE_DATABASE_URL;
if (!serviceUrl) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}

// --poll runs the same async-task poll the vendor-poll cron job runs, once, and exits — no
// --domain needed. Reviews and jobs always arrive this way (DataForSEO task_post/task_get).
if (values.poll) {
  const deps = createWorkerDeps(process.env);
  try {
    console.log(JSON.stringify(await deps.pollVendorTasks()));
  } finally {
    await deps.close();
  }
  process.exit(0);
}

const domain = values.domain?.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
if (!domain) {
  console.error(USAGE);
  process.exit(1);
}

const { db, close } = createDb(serviceUrl);
const deps = createWorkerDeps(process.env);
try {
  const [row] = await db
    .insert(competitor)
    .values({ name: values.name ?? domain, domain, placeId: values['place-id'] ?? null, cid: values.cid ?? null, metaPageId: values['meta-page-id'] ?? null })
    .onConflictDoUpdate({
      target: competitor.domain,
      set: {
        domain,
        ...(values['place-id'] ? { placeId: values['place-id'] } : {}),
        ...(values.cid ? { cid: values.cid } : {}),
        ...(values['meta-page-id'] ? { metaPageId: values['meta-page-id'] } : {}),
      },
    })
    .returning();
  if (!row) throw new Error('competitor upsert failed');
  console.log(`competitor ${row.id} (${domain})`);

  // The crawler must not hit real sites before https://rivalmonday.com/bot exists: with --vendors,
  // skip Phase 2a web discovery/capture unless --web is explicitly also passed.
  if (!values.vendors || values.web) {
    console.log('discovering pages…');
    console.log(JSON.stringify(await deps.discoverPages(row.id)));

    const pages = await db.select().from(trackedPage).where(eq(trackedPage.competitorId, row.id));
    const results: { url: string; type: string; status: string }[] = [];
    for (const p of pages) results.push({ url: p.url, type: p.pageType, status: (await deps.capturePage(p.id)).status });
    console.table(results);
  }

  if (values.vendors) {
    await ensureCompetitorSources(db, row.id);
    const vendorsOk = deps.vendorsConfigured();
    if (!vendorsOk) {
      console.log('[vendors] DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD not set; skipping gbp/ads_google/reviews/jobs (DataForSEO sources) — running ads_meta only');
    }
    const sourcesToRun: readonly SourceKind[] = vendorsOk ? (['gbp', 'ads_google', 'ads_meta'] as const) : (['ads_meta'] as const);
    const sourcesRun: SourceKind[] = [];
    for (const source of sourcesToRun) {
      console.log(`[vendors] ${source} → ${JSON.stringify(await deps.runSource(row.id, source as 'gbp' | 'ads_google' | 'ads_meta'))}`);
      sourcesRun.push(source);
    }
    if (vendorsOk) {
      await deps.postBatchTasks([{ competitorId: row.id, source: 'reviews' }, { competitorId: row.id, source: 'jobs' }]);
      sourcesRun.push('reviews', 'jobs');
      console.log(
        '[vendors] reviews/jobs tasks posted — DataForSEO fulfills these asynchronously; results arrive via the vendor-poll cron job ' +
          '(run `pnpm --filter @cs/worker collect-once --poll` to poll once manually).',
      );
    }
    // A live worker's vendor-schedule claims whatever is due now; without this, every source just
    // run here would also be immediately due for its next (weekly, or 700-depth backfill) run.
    if (sourcesRun.length > 0) {
      await db
        .update(competitorSource)
        .set({ nextDueAt: sql`now() + interval '7 days'` })
        .where(and(eq(competitorSource.competitorId, row.id), inArray(competitorSource.source, sourcesRun)));
    }
  }
} finally {
  await deps.close();
  await close();
}
