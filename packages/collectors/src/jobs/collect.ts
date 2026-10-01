import { competitor, type Db, observation } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import { collectReadyTasks } from '../reviews/collect';
import type { DataForSeoClient } from '../vendors/dataforseo';
import { parseDfsTimestamp } from '../vendors/dfs-time';

const SUFFIX_TOKENS = new Set(['llc', 'inc', 'co', 'corp', 'company', 'ltd']);

/** Lowercase, "&" → "and", split on non-alphanumerics, drop empty tokens and legal-suffix tokens. */
const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !SUFFIX_TOKENS.has(t));

/** True when `needle` appears as a contiguous run inside `haystack` (both token arrays). */
const containsRun = (haystack: string[], needle: string[]): boolean => {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((t, j) => haystack[i + j] === t)) return true;
  }
  return false;
};

const tokensEqual = (a: string[], b: string[]): boolean => a.length === b.length && a.every((t, i) => t === b[i]);

/**
 * True when the vendor's `employer_name` plausibly refers to the given competitor. Both names are
 * tokenized (lowercase, "&"→"and", split on non-alphanumerics, legal suffixes like "llc"/"inc"
 * dropped) and match when one name's tokens appear as a contiguous run inside the other's — this
 * requires whole-word boundaries, so "Walmart Van Furniture Movers" does not match "Art Van
 * Furniture" even though the compacted strings would overlap. When either joined name is very
 * short (< 4 chars, e.g. "AC"), a run match is too loose (it would match "ACE Hardware"), so we
 * require the token lists to be exactly equal instead.
 */
export function employerMatches(employer: string | null | undefined, competitorName: string): boolean {
  if (!employer) return false;
  const a = tokenize(employer);
  const b = tokenize(competitorName);
  if (a.length === 0 || b.length === 0) return false;
  if (a.join('').length < 4 || b.join('').length < 4) return tokensEqual(a, b);
  return containsRun(a, b) || containsRun(b, a);
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
