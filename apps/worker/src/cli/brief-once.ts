import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

const { createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } = await import('@cs/ai');
const { brief, briefItem, catalogRows, client, createDb, createDecisionSampleSink, createLedgerSink } = await import('@cs/db');
const { deliveryDateFor, generateBrief, generateStartingPoint, resetStartingPoint, safeTimezone } = await import('@cs/engine');
const { createCatalog } = await import('@cs/verticals');
const { and, eq, inArray } = await import('drizzle-orm');
const { parseBriefArgs } = await import('./brief-args');

const args = parseBriefArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}

const serviceUrl = process.env.SERVICE_DATABASE_URL;
if (!serviceUrl || !process.env.OPENROUTER_API_KEY) {
  console.error('SERVICE_DATABASE_URL and OPENROUTER_API_KEY are required');
  process.exit(1);
}

const { db, close } = createDb(serviceUrl);
try {
  const ai = createAiFromEnv(process.env, await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH), createLedgerSink(db), createDecisionSampleSink(db));
  const packs = createCatalog(() => catalogRows(db), { ttlMs: 60_000 }).packs;

  if (args.startingPoint) {
    const [c] = await db.select({ id: client.id }).from(client).where(eq(client.id, args.client));
    if (!c) throw new Error(`client ${args.client} not found`);
    if (args.force) {
      // Regenerate: delete the not-yet-approved starting point (items and recommendations too); approved/sent ones are refused.
      const reset = await resetStartingPoint(db, args.client);
      if ('refused' in reset) {
        console.error(reset.refused);
        await close();
        process.exit(1);
      }
    }
    // Retry a starting point that gave up: reset its failed attempts so the claim can take it again.
    await db.update(brief).set({ attempts: 0 }).where(and(eq(brief.clientId, args.client), eq(brief.kind, 'starting_point'), eq(brief.status, 'failed')));
  } else if (args.force) {
    // Regenerate: delete this client's not-yet-approved brief for the delivery date the run would use.
    const [c] = await db.select({ tz: client.timezone }).from(client).where(eq(client.id, args.client));
    if (!c) throw new Error(`client ${args.client} not found`);
    const date = deliveryDateFor(args.now ?? new Date(), safeTimezone(c.tz));
    await db.delete(brief).where(and(eq(brief.clientId, args.client), eq(brief.deliveryDate, date), inArray(brief.status, ['ready', 'failed', 'generating'])));
  }

  const r = args.startingPoint
    ? await generateStartingPoint({ db, ai, packs, ...(args.now ? { now: () => args.now! } : {}) }, args.client)
    : await generateBrief({ db, ai, packs }, args.client, { now: args.now });
  console.log(`[brief] ${JSON.stringify(r)}`);
  if (r.status === 'ready') {
    const [b] = await db.select().from(brief).where(eq(brief.id, r.briefId));
    const items = await db.select().from(briefItem).where(eq(briefItem.briefId, r.briefId)).orderBy(briefItem.ord);
    console.log(`\n${b!.kind.toUpperCase()} brief for ${b!.deliveryDate} (${b!.periodStart.toISOString()} → ${b!.periodEnd.toISOString()})\n${b!.summary}\n`);
    for (const i of items) console.log(`${i.ord + 1}. ${i.headline}\n   What changed: ${i.whatChanged}\n   Why it matters: ${i.whyItMatters}\n   Do this: ${i.recommendedAction}\n   [effort ${i.effort} · impact ${i.impact} · upsell ${i.upsellTag ?? '-'} · ${i.evidenceIds.length} evidence]\n`);
    console.log(`[trend] ${JSON.stringify(b!.trend)}\n[dropped] ${JSON.stringify(b!.dropped)}`);
  }
  process.exitCode = r.status === 'failed' ? 1 : 0;
} finally {
  await close();
}
