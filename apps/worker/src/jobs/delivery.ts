import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export interface DeliveryQueue {
  enqueueAlert(alertId: string): Promise<void>;
  enqueueBriefPdf(briefId: string): Promise<void>;
  enqueueReportPdf(reportId: string): Promise<void>;
}

/** M-f: one start-up warning (never the values) when delivery is not configured, so a silent no-op worker is noticed. */
export function warnIfDeliveryUnconfigured(deps: Pick<WorkerDeps, 'deliveryConfigured'>, warn: (msg: string) => void = console.warn): void {
  if (!deps.deliveryConfigured()) warn('[worker] delivery is not configured (APP_URL and LINK_SIGNING_SECRET of at least 32 characters): alerts, digests, briefs and reports will not be sent');
}

/** Phase 4b: alerts, digests, the outbox dispatcher, Monday brief delivery, PDFs and quarterly reports. */
export function createDeliveryJobs(deps: WorkerDeps, queue: DeliveryQueue) {
  const ready = () => deps.deliveryConfigured();
  const tick = z.looseObject({});
  const alertsSweep = defineJob({
    name: 'alerts-sweep', schema: tick, cron: '* * * * *',
    handler: async () => {
      if (!ready() || !deps.engineConfigured()) return;
      const r = await deps.sweepAlerts(new Date());
      for (const id of r.drafting) await queue.enqueueAlert(id);
      if (r.created + r.merged + r.expired > 0) console.log(`[alerts-sweep] created ${r.created}, merged ${r.merged}, expired ${r.expired}`);
    },
  });
  // retryLimit 0: a drafting alert is re-offered by the next sweep; the writer falls back to the template on model errors.
  const alertProcess = defineJob({
    name: 'alert-process', schema: z.object({ alertId: z.uuid() }), queue: { policy: 'short', retryLimit: 0 },
    handler: async ({ alertId }) => console.log(`[alert-process] ${alertId} → ${JSON.stringify(await deps.processAlert(alertId, new Date()))}`),
  });
  const digest = defineJob({
    name: 'alerts-digest', schema: tick, cron: '2 * * * *',
    handler: async () => {
      if (!ready()) return;
      const r = await deps.runAlertDigests(new Date());
      if (r.clients + r.withdrawn > 0) console.log(`[alerts-digest] ${JSON.stringify(r)}`);
    },
  });
  const dispatch = defineJob({
    name: 'notify-dispatch', schema: tick, cron: '* * * * *',
    handler: async () => {
      if (!ready()) return;
      const r = await deps.dispatchNotifications(new Date());
      if (r.sent + r.failed + r.retried > 0) console.log(`[notify-dispatch] ${JSON.stringify(r)}`);
    },
  });
  const briefsDeliver = defineJob({
    name: 'briefs-deliver', schema: tick, cron: '10 * * * *',
    handler: async () => {
      if (!ready()) return;
      const now = new Date();
      const r = await deps.deliverDueBriefs(now);
      // Also re-offer recently sent briefs whose PDF never rendered (the email links it); singletonKey dedupes.
      for (const id of new Set([...r.sent, ...(await deps.listBriefsMissingPdf(now))])) await queue.enqueueBriefPdf(id);
      if (r.sent.length + r.autoApproved + r.overdue > 0) console.log(`[briefs-deliver] sent ${r.sent.length} (auto ${r.autoApproved}), overdue ${r.overdue}`);
    },
  });
  const briefPdf = defineJob({
    name: 'brief-pdf', schema: z.object({ briefId: z.uuid() }), queue: { policy: 'short', retryLimit: 2, retryDelay: 300 },
    handler: async ({ briefId }) => console.log(`[brief-pdf] ${briefId} → ${JSON.stringify(await deps.renderBriefPdf(briefId))}`),
  });
  const reports = defineJob({
    name: 'reports-quarterly', schema: tick, cron: '20 * * * *',
    handler: async () => {
      if (!ready()) return;
      const now = new Date();
      const r = await deps.runQuarterlyReports(now);
      for (const id of new Set([...r.created, ...(await deps.listReportsMissingPdf(now))])) await queue.enqueueReportPdf(id);
      if (r.created.length > 0) console.log(`[reports-quarterly] created ${r.created.length}`);
    },
  });
  const reportPdf = defineJob({
    name: 'report-pdf', schema: z.object({ reportId: z.uuid() }), queue: { policy: 'short', retryLimit: 2, retryDelay: 300 },
    handler: async ({ reportId }) => console.log(`[report-pdf] ${reportId} → ${JSON.stringify(await deps.renderReportPdf(reportId))}`),
  });
  return { alertsSweep, alertProcess, digest, dispatch, briefsDeliver, briefPdf, reports, reportPdf };
}
