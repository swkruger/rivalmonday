import { z } from 'zod';
import type { CostAdapter } from '../types';
import { getValidated } from './util';

// Field paths from docs only (not live-verified, 2026-10-13). The v2 docs disagree on how a metric
// value is shaped, so accept: a number on the entry (compute_unit_seconds: 7200), the metric as a
// list of { metric_name, value }, or an entry-level `metrics` list of the same.
const METRIC = 'compute_unit_seconds';
const MAX_PAGES = 5;

const named = z.object({ metric_name: z.string(), value: z.number() });
const entry = z.object({
  compute_unit_seconds: z.union([z.number(), z.array(named)]).optional(),
  metrics: z.array(named).optional(),
});
const schema = z.object({
  projects: z.array(z.object({ periods: z.array(z.object({ consumption: z.array(entry) })) })),
  pagination: z.object({ cursor: z.string().nullish() }).nullish(),
});

/** null = the entry carries no recognisable metric (so an unknown body shape is an error, not "0 CU-hours"). */
function seconds(e: z.infer<typeof entry>): number | null {
  const v = e.compute_unit_seconds;
  if (typeof v === 'number') return v;
  const hits = [...(v ?? []), ...(e.metrics ?? [])].filter((m) => m.metric_name === METRIC);
  return hits.length ? hits.reduce((s, m) => s + m.value, 0) : null;
}

const isoNoMs = (d: Date) => d.toISOString().replace('.000Z', 'Z');

/** Month-to-date compute, in CU-hours (Neon has no dollar endpoint). */
export const neonAdapter: CostAdapter = async (env, fetchImpl, now) => {
  const { NEON_API_KEY: key, NEON_ORG_ID: org } = env;
  if (!key || !org) return { status: 'not_configured', kind: 'usage' };
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  let total = 0;
  let seen = 0;
  let matched = 0;
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const qs = new URLSearchParams({
      org_id: org,
      from: isoNoMs(from),
      to: isoNoMs(to),
      granularity: 'daily',
      metrics: METRIC,
      limit: '100',
    });
    if (cursor) qs.set('cursor', cursor);
    const r = await getValidated(
      fetchImpl,
      'usage',
      `https://console.neon.tech/api/v2/consumption_history/v2/projects?${qs}`,
      { Authorization: `Bearer ${key}` },
      schema,
    );
    if (!r.ok) return r.status === 403 ? { status: 'unavailable', kind: 'usage' } : r.reading;
    for (const p of r.data.projects) for (const per of p.periods) for (const e of per.consumption) {
      seen++;
      const sec = seconds(e);
      if (sec != null) {
        matched++;
        total += sec;
      }
    }
    cursor = r.data.pagination?.cursor ?? null;
    if (!cursor) break;
  }
  if (seen > 0 && matched === 0) return { status: 'error', kind: 'usage', error: 'bad response' };
  return { status: 'ok', kind: 'usage', units: Math.round((total / 3600) * 1e4) / 1e4 };
};
