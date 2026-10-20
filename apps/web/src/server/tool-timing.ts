import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 7a1 Task 9 (spec D7): per-request tool timings for `pnpm --filter @cs/web profile:pages`. Active only when the
 * server runs with `PROFILE_TOOLS=1` — never set in any deployed environment — and writes `<cwd>/.profile/tools.ndjson`
 * (git-ignored). Records hold the request path, tool name and times only; never inputs or outputs.
 */
export const profilingOn = (): boolean => process.env.PROFILE_TOOLS === '1';

/** Wall-clock ms with sub-ms precision; comparable across processes on one machine (the profiler joins on it). */
export const nowMs = (): number => performance.timeOrigin + performance.now();

export interface ToolTiming {
  /** The request's `x-rm-path` (path + search, set by `proxy.ts`); '' outside a request. */
  path: string;
  /** A tool name, or for `kind: 'db'` a query label (`select client`: first keyword and table only, never text or params). */
  tool: string;
  startMs: number;
  endMs: number;
  /** Absent = 'tool'. 'db' = one postgres round trip on the web's drizzle pools (`db-timing.ts`). */
  kind?: 'tool' | 'db';
}

/** Appends one NDJSON line. A no-op unless `PROFILE_TOOLS=1`; never throws into the request it measures. */
export function recordToolTiming(e: ToolTiming): void {
  if (!profilingOn()) return;
  try {
    const dir = join(process.cwd(), '.profile');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'tools.ndjson'), `${JSON.stringify({ path: e.path, tool: e.tool, startMs: e.startMs, endMs: e.endMs, kind: e.kind ?? 'tool' })}\n`);
  } catch {
    // profiling must never break a page
  }
}

/**
 * Spec D7's "sequential DB stages": the number of groups left after merging overlapping (or touching) spans. Reads
 * awaited together in `Promise.all` overlap and count once; each read that waits for an earlier one adds a stage.
 */
export function sequentialStages(spans: readonly { startMs: number; endMs: number }[]): number {
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs);
  let stages = 0;
  let groupEnd = Number.NEGATIVE_INFINITY;
  for (const s of sorted) {
    if (s.startMs > groupEnd) stages++;
    groupEnd = Math.max(groupEnd, s.endMs);
  }
  return stages;
}
