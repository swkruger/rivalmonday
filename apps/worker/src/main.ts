import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

import { createBoss, enqueue, registerJobs } from './boss';
import { createWorkerDeps } from './deps';
import { heartbeatJob } from './jobs/heartbeat';
import { createWebJobs } from './jobs/web';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const boss = createBoss(url);
await boss.start();

const deps = createWorkerDeps(process.env);
const web = createWebJobs(deps, {
  enqueueCapture: async (trackedPageId) => {
    await enqueue(boss, web.capture, { trackedPageId });
  },
});
await registerJobs(boss, [heartbeatJob, web.schedule, web.capture, web.discover]);
console.log('[worker] started');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await deps.close();
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  });
}
