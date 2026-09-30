import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

import { z } from 'zod';
import { createBoss, registerJobs } from './boss';
import { defineJob } from './jobs';

export const heartbeatJob = defineJob({
  name: 'system-heartbeat',
  schema: z.looseObject({}),
  cron: '*/5 * * * *',
  handler: async () => {
    console.log(`[worker] heartbeat ${new Date().toISOString()}`);
  },
});

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const boss = createBoss(url);
await boss.start();
await registerJobs(boss, [heartbeatJob]);
console.log('[worker] started');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  });
}
