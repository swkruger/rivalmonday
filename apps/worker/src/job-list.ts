import type PgBoss from 'pg-boss';
import type { EnvName } from '@cs/db';
import { startCompetitorSearch } from '@cs/tools';
import { createAskJobs } from './jobs/ask';
import { createRankMapJobs } from './jobs/rank-map';
import { createKbJobs } from './jobs/kb';
import { createBillingJobs } from './jobs/billing-daily';
import { createBillingNoticeJobs } from './jobs/billing-notices';
import { createBriefJobs, createStartingPointJobs } from './jobs/briefs';
import { createDeliveryJobs } from './jobs/delivery';
import { createEngineJobs } from './jobs/engine';
import { heartbeatJob } from './jobs/heartbeat';
import { createModelOpsJobs } from './jobs/model-ops';
import { createMovesJobs } from './jobs/moves';
import { createOnboardingJobs } from './jobs/onboarding';
import { createOpsJobs } from './jobs/ops';
import { createLeadJobs } from './jobs/leads';
import { createRunbookJobs } from './jobs/runbooks';
import { createSetupJobs } from './jobs/setup';
import { createPlatformCostsJobs } from './jobs/platform-costs';
import { createSpendGuardJobs } from './jobs/spend-guard';
import { createPlatformStatsJobs } from './jobs/platform-stats';
import { createProspectJobs } from './jobs/prospects';
import { createReviewJobs } from './jobs/reviews';
import { createRivalJobs } from './jobs/rivals';
import { createVendorJobs } from './jobs/vendor';
import { createWebJobs } from './jobs/web';
import { enqueue } from './boss';
import type { WorkerDeps } from './deps';
import type { JobDefinition } from './jobs';

/**
 * Every job the worker daemon registers, wired to `boss` for follow-up enqueues. The factories only touch `deps` and
 * `boss` inside handlers, so the list can be built before the deps exist (7c2: the app pool is sized from it).
 */
// biome-ignore lint: heterogeneous job payloads
export function createJobList(deps: WorkerDeps, boss: PgBoss, opts: { envName: EnvName; env: NodeJS.ProcessEnv }): JobDefinition<any>[] {
  const billing = createBillingJobs(deps, { envName: opts.envName, env: opts.env });
  const billingNotices = createBillingNoticeJobs(deps, { envName: opts.envName });
  const spendGuard = createSpendGuardJobs(deps, { envName: opts.envName });
  const onboarding = createOnboardingJobs(deps, { envName: opts.envName });
  const setup = createSetupJobs(deps, { envName: opts.envName });
  const runbooks = createRunbookJobs(deps, { envName: opts.envName });
  const leads = createLeadJobs(deps, { envName: opts.envName });
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
    enqueueReask: async (reviewId) => {
      await enqueue(boss, engine.reask, { reviewId }, { singletonKey: `reask:${reviewId}` });
    },
    enqueuePrice: async (captureId) => {
      await enqueue(boss, engine.price, { captureId }, { singletonKey: captureId });
    },
  });
  const web = createWebJobs(deps, {
    enqueueCapture: async (trackedPageId, startAfter) => {
      const singletonKey = `capture:${trackedPageId}`;
      await enqueue(boss, web.capture, { trackedPageId }, startAfter === undefined ? { singletonKey } : { singletonKey, startAfter });
    },
    enqueueDiff: async (captureId) => {
      if (deps.engineConfigured()) await enqueue(boss, engine.diff, { captureId }, { singletonKey: captureId });
    },
  });
  const vendor = createVendorJobs(deps, {
    enqueueCollect: async (p) => {
      await enqueue(boss, vendor.collect, p);
    },
    enqueueRankScan: async (clientId, data) => {
      await enqueue(boss, vendor.rankScan, { clientId, trigger: data?.trigger ?? 'scheduled', scanId: data?.scanId, requestedBy: data?.requestedBy });
    },
    enqueueRankMap: async (clientId) => {
      await enqueue(boss, rankMap.refresh, { clientId }, { singletonKey: clientId });
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
  const rankMap = createRankMapJobs(deps);
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
  const ops = createOpsJobs(deps);
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

  return [
    heartbeatJob, web.schedule, web.capture, web.discover, vendor.schedule, vendor.collect, vendor.poll, vendor.rankSchedule, vendor.rankScan, rankMap.refresh, prospects.snapshot,
    rivals.search, rivals.finalise, rivals.sweep, rivals.signalsWeekly, rivals.monthly, rivals.monthlyClient,
    engine.sweep, engine.diff, engine.rankDiff, engine.tag, engine.score, engine.review, engine.reask, engine.price, reviews.nightly, moves.nightly, moves.client,
    modelOps.batchPoll, platformStats.daily, billing.daily, billingNotices.notices, onboarding.nudges, setup.suggestions, setup.reminders, runbooks.tailor, leads.preview, leads.cleanup, platformCosts.snapshot, spendGuard.guard, ops.readiness, briefs.schedule, briefs.client, startingPoints.schedule, startingPoints.client, ask.starters, kb.embed, kb.importUrl, kb.sync,
    delivery.alertsSweep, delivery.alertProcess, delivery.digest, delivery.dispatch, delivery.briefsDeliver, delivery.briefPdf, delivery.reports, delivery.reportPdf,
  ];
}
