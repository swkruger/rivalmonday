import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } = await import('@cs/ai');
const { changeEvent, clientCompetitor, createDb, createLedgerSink, eventScore, move } = await import('@cs/db');
const { createPackLoader, drainEngine, listMoveClients, priceMatrix, reviewBenchmark, runReviewInsights, updateMovesForClient } = await import('@cs/engine');
const { createStoreFromEnv } = await import('@cs/storage');
const { desc, eq, inArray } = await import('drizzle-orm');
const { parseEngineArgs } = await import('./engine-args');

const args = parseEngineArgs(process.argv.slice(2));
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
  const ai = createAiFromEnv(process.env, await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH), createLedgerSink(db));
  const packs = createPackLoader();
  const result = await drainEngine({ db, store: createStoreFromEnv(process.env), ai, packs }, { competitorId: args.competitor, maxRounds: args.rounds });
  console.log(JSON.stringify(result));
  const events = await db
    .select()
    .from(changeEvent)
    .where(args.competitor ? eq(changeEvent.competitorId, args.competitor) : undefined)
    .orderBy(desc(changeEvent.createdAt))
    .limit(20);
  const scores = events.length > 0 ? await db.select().from(eventScore).where(inArray(eventScore.eventId, events.map((e) => e.id))) : [];
  for (const e of events) {
    const s = scores.filter((x) => x.eventId === e.id).map((x) => `${x.clientId.slice(0, 8)}:${x.route}(${x.score})`).join(' ');
    console.log(`${e.occurredAt.toISOString().slice(0, 10)} ${e.changeType.padEnd(19)} ${e.summary}  [${s || 'unscored'}]`);
  }
  const insights = args.insights ? await runReviewInsights({ db, ai, packs }, { competitorId: args.competitor }) : undefined;
  if (insights) console.log(`[insights] ${JSON.stringify(insights)}`);
  if (args.moves) {
    const clientIds = args.competitor
      ? (await db.select({ id: clientCompetitor.clientId }).from(clientCompetitor).where(eq(clientCompetitor.competitorId, args.competitor))).map((r) => r.id)
      : await listMoveClients(db);
    for (const id of clientIds) console.log(`[moves] ${id.slice(0, 8)} → ${JSON.stringify(await updateMovesForClient({ db, packs }, id))}`);
    const open = await db.select().from(move).where(args.competitor ? eq(move.competitorId, args.competitor) : undefined).orderBy(desc(move.updatedAt)).limit(20);
    for (const m of open) console.log(`${m.status.padEnd(8)} ${m.moveType.padEnd(19)} ${m.confidence.toFixed(2)} ${m.summary}${m.closedAt ? ' (closed)' : ''}`);
  }
  if (args.client) {
    const bench = await reviewBenchmark({ db, packs }, args.client);
    for (const b of bench.businesses) {
      const themes = b.themes.filter((t) => t.mentions > 0).map((t) => `${t.name} ${Math.round((t.share ?? 0) * 100)}% (${t.sentiment})`);
      console.log(`[benchmark] ${b.self ? '*' : ' '} ${b.name}: ${b.reviews} reviews, avg ${b.avgRating} (prev ${b.prevReviews} / ${b.prevAvgRating}); ${themes.join(', ') || 'no themes yet'}`);
    }
    const matrix = await priceMatrix({ db, packs }, args.client);
    const serviceNames = new Map(matrix.services.map((s) => [s.id, s.name]));
    for (const row of matrix.rows) {
      const cells = Object.entries(row.cells).map(
        ([s, ps]) => `${serviceNames.get(s) ?? s} ${ps.map((p) => `${p.qualifier === 'from' ? 'from ' : p.qualifier === 'up_to' ? 'up to ' : ''}$${p.amount}${p.unit === 'USD' ? '' : p.unit.slice(3)}`).join('/')}`,
      );
      console.log(`[prices] ${row.name}: ${cells.join('; ') || 'no prices yet'}`);
    }
  }
  if (result.errors > 0 || (insights?.errors ?? 0) > 0) process.exitCode = 1;
} finally {
  await close();
}
