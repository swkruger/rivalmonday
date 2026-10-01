import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { competitor, createDb, trackedPage } = await import('@cs/db');
const { eq } = await import('drizzle-orm');
const { createWorkerDeps } = await import('../deps');

const { values } = parseArgs({ options: { domain: { type: 'string' }, name: { type: 'string' } } });
const domain = values.domain?.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
if (!domain) {
  console.error('Usage: pnpm --filter @cs/worker collect-once --domain example.com [--name "Example Co"]');
  process.exit(1);
}
const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}

const { db, close } = createDb(url);
const deps = createWorkerDeps(process.env);
try {
  const [row] = await db
    .insert(competitor)
    .values({ name: values.name ?? domain, domain })
    .onConflictDoUpdate({ target: competitor.domain, set: { domain } })
    .returning();
  if (!row) throw new Error('competitor upsert failed');
  console.log(`competitor ${row.id} (${domain}) — discovering pages…`);
  console.log(JSON.stringify(await deps.discoverPages(row.id)));

  const pages = await db.select().from(trackedPage).where(eq(trackedPage.competitorId, row.id));
  const results: { url: string; type: string; status: string }[] = [];
  for (const p of pages) results.push({ url: p.url, type: p.pageType, status: (await deps.capturePage(p.id)).status });
  console.table(results);
} finally {
  await deps.close();
  await close();
}
