import { fileURLToPath } from 'node:url';
import * as Sentry from '@sentry/node';
import { resolveActiveEnvName } from '@cs/db';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

import { AiPausedError } from '@cs/core';
import { createBoss, registerJobs } from './boss';
import { appPoolMax, applyConcurrency, parseConcurrencyOverrides, QUEUE_CONCURRENCY } from './concurrency';
import { createWorkerDeps, type WorkerDeps } from './deps';
import { missingProdEnv, rehearsalEnvErrors } from './env';
import { healthState, startHealthServer } from './health';
import { createJobList } from './job-list';
import { warnIfDeliveryUnconfigured } from './jobs/delivery';
import { workerLog } from './log';
import { ensureQueueGrantsAt } from './queue-grants';
import { initWorkerSentry } from './sentry';

initWorkerSentry(process.env);
const missing = missingProdEnv(process.env);
if (missing.length > 0) {
  process.stderr.write(`[worker] missing required env: ${missing.join(', ')}\n`);
  process.exit(1);
}

const rehearsalErrors = rehearsalEnvErrors(process.env);
if (rehearsalErrors.length > 0) {
  process.stderr.write(`[worker] ${rehearsalErrors.join('; ')}
`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('[worker] DATABASE_URL is required\n');
  process.exit(1);
}

// 7c2: pollers per queue (defaults + WORKER_QUEUE_CONCURRENCY) and the app pool sized from them. The job factories only
// touch deps inside handlers, so the list is built first and `deps` is bound right after (the pool size depends on it).
let workerDeps: WorkerDeps | undefined;
const lateDeps = new Proxy({} as WorkerDeps, {
  get: (_target, key) => {
    if (!workerDeps) throw new Error(`worker deps used before creation (${String(key)})`);
    return Reflect.get(workerDeps, key);
  },
});
const liveEnvName = resolveActiveEnvName(process.env, fileURLToPath(new URL('../../../', import.meta.url)));
const boss = createBoss(url);
const allJobs = createJobList(lateDeps, boss, { envName: liveEnvName, env: process.env });
let jobs: typeof allJobs;
try {
  jobs = applyConcurrency(allJobs, { ...QUEUE_CONCURRENCY, ...parseConcurrencyOverrides(process.env, allJobs.map((j) => j.name)) });
} catch (err) {
  process.stderr.write(`[worker] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
const poolMax = appPoolMax(jobs);
const deps = (workerDeps = createWorkerDeps(process.env, { appPoolMax: poolMax }));
workerLog.info({ concurrency: Object.fromEntries(jobs.filter((j) => (j.localConcurrency ?? 1) > 1).map((j) => [j.name, j.localConcurrency])), appPoolMax: poolMax }, 'queue concurrency');
if (!process.env.SERVICE_DATABASE_POOLED_URL?.trim()) workerLog.warn('SERVICE_DATABASE_POOLED_URL unset; app queries use the direct URL');

// Railway's health check. 503 until boss.start() below; boss.start() counts as the first heartbeat (plan D3).
const healthServer = startHealthServer(Number(process.env.PORT) || 8080);
await boss.start();
healthState.startedAt = new Date();
// Spec D9: let cs_web enqueue and read job status. Non-fatal: a failure only stops web enqueues (logged + Sentry),
// while crashing here would stop every background job and restart-loop the container. 7c2: `/healthz` is 503 while
// the grants fail, and the heartbeat retries them every 5 minutes.
try {
  await ensureQueueGrantsAt(url);
  healthState.queueGrantsOk = true;
} catch (err) {
  healthState.queueGrantsOk = false;
  Sentry.captureException(err);
  workerLog.error({ err }, 'queue grants for cs_web failed; web enqueues will be refused');
}

// 7b1: true while the platform is spend-paused (the guard's platform-level check); `usesAi` batches are then deferred.
const aiPaused = async (): Promise<boolean> => {
  try {
    await deps.aiGuard()?.assertAllowed({ agencyId: null, clientId: null });
    return false;
  } catch (err) {
    // Any other guard error: let the jobs run; each AI call asks the guard itself.
    return err instanceof AiPausedError && err.reason === 'platform';
  }
};
await registerJobs(boss, jobs, { aiPaused });
workerLog.info('worker started');
warnIfDeliveryUnconfigured(deps);

// pg-boss 10's stop({ graceful: true, wait: true }) resolves only after in-flight handlers drain
// (or `timeout` elapses) — see node_modules/pg-boss/src/index.js `stop()`. Stopping pg-boss before
// closing deps means a running web-capture-page job keeps its browser/DB pool until it finishes.
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    healthServer.close();
    await boss.stop({ graceful: true, timeout: 30_000, wait: true });
    await deps.close();
    await Sentry.close(2000); // flush events captured just before SIGTERM; no-op without a client
    process.exit(0);
  });
}
