import { competitor, type Db, observation } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import { collectReadyTasks } from '../reviews/collect';
import type { DataForSeoClient } from '../vendors/dataforseo';
import { parseDfsTimestamp } from '../vendors/dfs-time';

const norm = (s: string) => s.toLowerCase().replace(/\b(llc|inc|co|corp|company|ltd)\b/g, '').replace(/[^a-z0-9]+/g, '');

/**
 * True when the vendor's `employer_name` plausibly refers to the given competitor. Normalised
 * names (lowercase alphanumerics, legal suffixes stripped) match if either contains the other —
 * except when one side is very short (< 4 chars, e.g. "AC"), where a substring match is too loose
 * (it would match "ACE Hardware") and we require exact equality instead.
 */
export function employerMatches(employer: string | null | undefined, competitorName: string): boolean {
  if (!employer) return false;
  const a = norm(employer);
  const b = norm(competitorName);
  if (a.length === 0 || b.length === 0) return false;
  if (a.length < 4 || b.length < 4) return a === b;
  return a.includes(b) || b.includes(a);
}

const jobSchema = z.looseObject({
  job_id: z.string(),
  title: z.string().nullish(),
  employer_name: z.string().nullish(),
  location: z.string().nullish(),
  source_url: z.string().nullish(),
  salary: z.string().nullish(),
  contract_type: z.string().nullish(),
  timestamp: z.union([z.string(), z.number()]).nullish(),
});

export async function collectReadyJobs(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient }): Promise<{ collected: number; failed: number; postings: number }> {
  let postings = 0;
  const r = await collectReadyTasks(deps, 'google_jobs', '/serp/google/jobs/tasks_ready', (id) => `/serp/google/jobs/task_get/advanced/${id}`, async (task, vt) => {
    const [c] = await deps.db.select().from(competitor).where(eq(competitor.id, vt.competitorId)).limit(1);
    if (!c) return;
    // Job postings are business data, not reviewer PII — no scrubbing before capture (unlike reviews).
    const { captureId } = await recordVendorCapture(deps, { competitorId: c.id, source: 'google_jobs', collectorVersion: DFS_COLLECTOR_VERSION, status: 'ok', payload: task.result });
    const items = (task.result[0] as { items?: unknown[] } | undefined)?.items ?? [];
    const rows = items
      .map((i) => jobSchema.safeParse(i))
      .filter((p) => p.success && employerMatches(p.data.employer_name, c.name))
      .map((p) => {
        const j = (p as { data: z.infer<typeof jobSchema> }).data;
        return {
          competitorId: c.id, captureId, kind: 'job_posting', key: j.job_id,
          data: { title: j.title ?? null, employer: j.employer_name ?? null, location: j.location ?? null, sourceUrl: j.source_url ?? null, salary: j.salary ?? null, contractType: j.contract_type ?? null, postedAt: parseDfsTimestamp(j.timestamp)?.toISOString() ?? null },
        };
      });
    // A task's items can repeat a job_id (vendor pagination/overlap); the observation unique key
    // is (capture_id, kind, key), so onConflictDoNothing is a safe within-task dedupe, not a bug.
    if (rows.length > 0) await deps.db.insert(observation).values(rows).onConflictDoNothing();
    postings += rows.length;
  });
  return { ...r, postings };
}
