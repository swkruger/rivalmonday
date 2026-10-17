import { fileURLToPath } from 'node:url';
import { resolveActiveEnvName } from '@cs/db';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

import { startCompetitorSearch } from '@cs/tools';
import { createBoss, enqueue, registerJobs } from './boss';
import { createWorkerDeps } from './deps';
import { createAskJobs } from './jobs/ask';
import { createKbJobs } from './jobs/kb';
import { createBillingJobs } from './jobs/billing-daily';
import { createBillingNoticeJobs } from './jobs/billing-notices';
import { createBriefJobs, createStartingPointJobs } from './jobs/briefs';
import { createDeliveryJobs, warnIfDeliveryUnconfigured } from './jobs/delivery';
import { createEngineJobs } from './jobs/engine';
import { heartbeatJob } from './jobs/heartbeat';
import { createModelOpsJobs } from './jobs/model-ops';
import { createMovesJobs } from './jobs/moves';
import { createOnboardingJobs } from './jobs/onboarding';
import { createSetupJobs } from './jobs/setup';
import { createPlatformCostsJobs } from './jobs/platform-costs';
import { createPlatformStatsJobs } from './jobs/platform-stats';
import { createProspectJobs } from './jobs/prospects';
import { createReviewJobs } from './jobs/reviews';
import { createRivalJobs } from './jobs/rivals';
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
const liveEnvName = resolveActiveEnvName(process.env, fileURLToPath(new URL('../../../', import.meta.url)));
const billing = createBillingJobs(deps, { envName: liveEnvName, env: process.env });
const billingNotices = createBillingNoticeJobs(deps, { envName: liveEnvName });
const onboarding = createOnboardingJobs(deps, { envName: liveEnvName });
const setup = createSetupJobs(deps, { envName: liveEnvName });
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
  enqueueRivalFinalise: async (runId) => {
    await enqueue(boss, rivals.finalise, { runId, force: false }, { singletonKey: `rival-finalise:${runId}` });
  },
});
const rivals = createRivalJobs(deps, {
  // The forced finalise has its own key: a short queue keeps one *queued* job per key, and this one waits 30 min.
  enqueueFinalise: async (runId, { force, startAfter }) => {
    await enqueue(boss, rivals.finalise, { runId, force }, { singletonKey: `rival-finalise${force ? '-force' : ''}:${runId}`, startAfter });
  },
  enqueueMonthlyClient: async (clientId, opts) => {
    await enqueue(boss, rivals.monthlyClient, { clientId }, opts);
  },
  startScheduledSearch: (clientId) =>
    startCompetitorSearch(
      {
        app: deps.serviceDb(),
        service: deps.serviceDb(),
        enqueue: async (_job, data, singletonKey) => {
          await enqueue(boss, rivals.search, { runId: data.runId! }, { singletonKey });
        },
      },
      clientId,
      'scheduled',
    ),
});
const moves = createMovesJobs(deps, {
  enqueueMovesClient: async (clientId) => {
    await enqueue(boss, moves.client, { clientId }, { singletonKey: clientId });
  },
});
const ask = createAskJobs(deps);
const kb = createKbJobs(deps, {
  enqueueEmbed: async (articleId) => {
    await enqueue(boss, kb.embed, { articleId }, { singletonKey: `kb-embed:${articleId}` });
  },
});
const briefs = createBriefJobs(deps, {
  enqueueBriefClient: async (clientId) => {
    await enqueue(boss, briefs.client, { clientId }, { singletonKey: clientId });
  },
  enqueueAskStarters: async (clientId) => {
    await enqueue(boss, ask.starters, { clientId }, { singletonKey: clientId });
  },
});
const startingPoints = createStartingPointJobs(deps, {
  enqueueStartingPointClient: async (clientId) => {
    await enqueue(boss, startingPoints.client, { clientId }, { singletonKey: `sp:${clientId}` });
  },
});
const reviews = createReviewJobs(deps);
const modelOps = createModelOpsJobs(deps);
const platformStats = createPlatformStatsJobs(deps);
const platformCosts = createPlatformCostsJobs(deps);
const prospects = createProspectJobs(deps);
const delivery = createDeliveryJobs(deps, {
  enqueueAlert: async (alertId) => {
    await enqueue(boss, delivery.alertProcess, { alertId }, { singletonKey: alertId });
  },
  enqueueBriefPdf: async (briefId) => {
    await enqueue(boss, delivery.briefPdf, { briefId }, { singletonKey: briefId });
  },
  enqueueReportPdf: async (reportId) => {
    await enqueue(boss, delivery.reportPdf, { reportId }, { singletonKey: reportId });
  },
});
await registerJobs(boss, [
  heartbeatJob, web.schedule, web.capture, web.discover, vendor.schedule, vendor.collect, vendor.poll, vendor.rankSchedule, vendor.rankScan, prospects.snapshot,
  rivals.search, rivals.finalise, rivals.sweep, rivals.signalsWeekly, rivals.monthly, rivals.monthlyClient,
  engine.sweep, engine.diff, engine.rankDiff, engine.tag, engine.score, engine.review, engine.price, reviews.nightly, moves.nightly, moves.client,
  modelOps.batchPoll, platformStats.daily, billing.daily, billingNotices.notices, onboarding.nudges, setup.suggestions, platformCosts.snapshot, briefs.schedule, briefs.client, startingPoints.schedule, startingPoints.client, ask.starters, kb.embed, kb.importUrl, kb.sync,
  delivery.alertsSweep, delivery.alertProcess, delivery.digest, delivery.dispatch, delivery.briefsDeliver, delivery.briefPdf, delivery.reports, delivery.reportPdf,
]);
console.log('[worker] started');
warnIfDeliveryUnconfigured(deps);

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
