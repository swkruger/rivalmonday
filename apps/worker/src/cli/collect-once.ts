import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { competitor, createDb, trackedPage } = await import('@cs/db');
const { ensureCompetitorSources } = await import('@cs/collectors');
const { eq } = await import('drizzle-orm');
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
    for (const source of ['gbp', 'ads_google', 'ads_meta'] as const) {
      console.log(`[vendors] ${source} → ${JSON.stringify(await deps.runSource(row.id, source))}`);
    }
    await deps.postBatchTasks([{ competitorId: row.id, source: 'reviews' }, { competitorId: row.id, source: 'jobs' }]);
    console.log(
      '[vendors] reviews/jobs tasks posted — DataForSEO fulfills these asynchronously; results arrive via the vendor-poll cron job ' +
        '(run `pnpm --filter @cs/worker collect-once --poll` to poll once manually).',
    );
  }
} finally {
  await deps.close();
  await close();
}
