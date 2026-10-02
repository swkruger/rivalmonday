import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } = await import('@cs/ai');
const { changeEvent, createDb, createLedgerSink, eventScore } = await import('@cs/db');
const { createPackLoader, drainEngine } = await import('@cs/engine');
const { createStoreFromEnv } = await import('@cs/storage');
const { desc, eq, inArray } = await import('drizzle-orm');

const { values } = parseArgs({ options: { competitor: { type: 'string' }, rounds: { type: 'string', default: '10' } } });
const serviceUrl = process.env.SERVICE_DATABASE_URL;
if (!serviceUrl || !process.env.OPENROUTER_API_KEY) {
  console.error('SERVICE_DATABASE_URL and OPENROUTER_API_KEY are required');
  process.exit(1);
}

const { db, close } = createDb(serviceUrl);
try {
  const ai = createAiFromEnv(process.env, await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH), createLedgerSink(db));
  const result = await drainEngine({ db, store: createStoreFromEnv(process.env), ai, packs: createPackLoader() }, { competitorId: values.competitor, maxRounds: Number(values.rounds) });
  console.log(JSON.stringify(result));
  const events = await db
    .select()
    .from(changeEvent)
    .where(values.competitor ? eq(changeEvent.competitorId, values.competitor) : undefined)
    .orderBy(desc(changeEvent.createdAt))
    .limit(20);
  const scores = events.length > 0 ? await db.select().from(eventScore).where(inArray(eventScore.eventId, events.map((e) => e.id))) : [];
  for (const e of events) {
    const s = scores.filter((x) => x.eventId === e.id).map((x) => `${x.clientId.slice(0, 8)}:${x.route}(${x.score})`).join(' ');
    console.log(`${e.occurredAt.toISOString().slice(0, 10)} ${e.changeType.padEnd(19)} ${e.summary}  [${s || 'unscored'}]`);
  }
} finally {
  await close();
}
