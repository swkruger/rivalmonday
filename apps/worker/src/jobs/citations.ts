import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';
import { SINGLE_SHOT_QUEUE } from './vendor';

/** The daily fan-out spaces its per-client jobs this far apart (pg-boss `startAfter`): one poller, a run is a few paid searches. */
export const CITATION_SPACING_SECONDS = 60;

/**
 * 18c directory listings: `citation-audit` (daily) fails dead runs and queues one `citation-audit-client` per due client
 * (30-day cadence is enforced by the due list); the client job runs the guarded audit and, when it finished, the
 * `citation_diff` stage, whose changes go on to the tag stage.
 */
export function createCitationJobs(
  deps: WorkerDeps,
  queue: {
    enqueueClient(clientId: string, opts: { startAfter: number; singletonKey: string }): Promise<void>;
    enqueueTag(changeId: string): Promise<void>;
    now?: () => Date;
  },
) {
  const now = queue.now ?? (() => new Date());
  let warnedUnconfigured = false;
  const audit = defineJob({
    name: 'citation-audit', schema: z.looseObject({}), cron: '0 9 * * *',
    handler: async () => {
      if (!deps.vendorsConfigured()) {
        if (!warnedUnconfigured) {
          warnedUnconfigured = true;
          workerLog.info('[citation-audit] DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD not set; skipping');
        }
        return;
      }
      const at = now();
      const stale = await deps.failStaleCitationRuns(at);
      if (stale > 0) workerLog.warn(`[citation-audit] failed ${stale} stale running audit(s)`);
      const day = at.toISOString().slice(0, 10);
      const ids = await deps.listCitationDueClients(at);
      for (const [i, clientId] of ids.entries()) {
        try {
          await queue.enqueueClient(clientId, { startAfter: i * CITATION_SPACING_SECONDS, singletonKey: `citation:${clientId}:${day}` });
        } catch (err) {
          workerLog.error({ err }, `[citation-audit] client ${clientId} enqueue failed`);
        }
      }
      if (ids.length > 0) workerLog.info(`[citation-audit] queued ${ids.length} client audit(s)`);
    },
  });
  const client = defineJob({
    name: 'citation-audit-client', schema: z.object({ clientId: z.uuid() }),
    // Paid searches: never retried, never expired mid-run; queued duplicates collapse.
    queue: { ...SINGLE_SHOT_QUEUE, policy: 'short' },
    handler: async ({ clientId }) => {
      const r = await deps.runCitationAudit(clientId);
      workerLog.info(`[citation-audit-client] ${clientId} → ${JSON.stringify(r)}`);
      if (r.runId && (r.status === 'done' || r.status === 'capped')) {
        const d = await deps.diffCitations(r.runId);
        for (const id of d.changeIds) await queue.enqueueTag(id);
        if (d.ran) workerLog.info(`[citation-audit-client] ${r.runId} → ${d.changeIds.length} change(s)`);
      }
    },
  });
  return { audit, client };
}
