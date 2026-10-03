import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

import { createBoss, enqueue, registerJobs } from './boss';
import { createWorkerDeps } from './deps';
import { createBriefJobs } from './jobs/briefs';
import { createEngineJobs } from './jobs/engine';
import { heartbeatJob } from './jobs/heartbeat';
import { createModelOpsJobs } from './jobs/model-ops';
import { createMovesJobs } from './jobs/moves';
import { createReviewJobs } from './jobs/reviews';
import { createVendorJobs } from './jobs/vendor';
import { createWebJobs } from './jobs/web';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const boss = createBoss(url);
await boss.start();

const deps = createWorkerDeps(process.env);
const engine = createEngineJobs(deps, {
  enqueueDiff: async (captureId) => {
    await enqueue(boss, engine.diff, { captureId }, { singletonKey: captureId });
  },
  enqueueRankDiff: async (scanId) => {
    await enqueue(boss, engine.rankDiff, { scanId }, { singletonKey: scanId });
  },
  enqueueTag: async (changeId) => {
    await enqueue(boss, engine.tag, { changeId }, { singletonKey: changeId });
  },
  enqueueScore: async (eventId) => {
    await enqueue(boss, engine.score, { eventId }, { singletonKey: eventId });
  },
  enqueueReview: async (reviewId) => {
    await enqueue(boss, engine.review, { reviewId }, { singletonKey: reviewId });
  },
  enqueuePrice: async (captureId) => {
    await enqueue(boss, engine.price, { captureId }, { singletonKey: captureId });
  },
});
const web = createWebJobs(deps, {
  enqueueCapture: async (trackedPageId) => {
    await enqueue(boss, web.capture, { trackedPageId });
  },
  enqueueDiff: async (captureId) => {
    if (deps.engineConfigured()) await enqueue(boss, engine.diff, { captureId }, { singletonKey: captureId });
  },
});
const vendor = createVendorJobs(deps, {
  enqueueCollect: async (p) => {
    await enqueue(boss, vendor.collect, p);
  },
  enqueueRankScan: async (clientId) => {
    await enqueue(boss, vendor.rankScan, { clientId });
  },
});
const moves = createMovesJobs(deps, {
  enqueueMovesClient: async (clientId) => {
    await enqueue(boss, moves.client, { clientId }, { singletonKey: clientId });
  },
});
const briefs = createBriefJobs(deps, {
  enqueueBriefClient: async (clientId) => {
    await enqueue(boss, briefs.client, { clientId }, { singletonKey: clientId });
  },
});
const reviews = createReviewJobs(deps);
const modelOps = createModelOpsJobs(deps);
await registerJobs(boss, [
  heartbeatJob, web.schedule, web.capture, web.discover, vendor.schedule, vendor.collect, vendor.poll, vendor.rankSchedule, vendor.rankScan, vendor.suggest,
  engine.sweep, engine.diff, engine.rankDiff, engine.tag, engine.score, engine.review, engine.price, reviews.nightly, moves.nightly, moves.client,
  modelOps.batchPoll, briefs.schedule, briefs.client,
]);
console.log('[worker] started');

// pg-boss 10's stop({ graceful: true, wait: true }) resolves only after in-flight handlers drain
// (or `timeout` elapses) — see node_modules/pg-boss/src/index.js `stop()`. Stopping pg-boss before
// closing deps means a running web-capture-page job keeps its browser/DB pool until it finishes.
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await boss.stop({ graceful: true, timeout: 30_000, wait: true });
    await deps.close();
    process.exit(0);
  });
}
