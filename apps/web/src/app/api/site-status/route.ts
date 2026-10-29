import { type SiteStatus, siteStatus } from '@cs/tools';
import { toolDeps } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** Phase 17a: public pilot flag + rounded counters for the marketing site. Aggregates only; no auth, no PII. GET only. */
const base = { 'Access-Control-Allow-Origin': '*' }; // public aggregate data, no credentials (P6)
const headers = { ...base, 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' };
/** A degraded answer (counters failed) must not stick in the CDN for five minutes. */
const degradedHeaders = { ...base, 'Cache-Control': 'no-store' };

/** Per-instance memo: a `?x=random` cache-buster must not turn into one DB query per request. Only good answers are kept. */
const MEMO_MS = 60_000;
let memo: { at: number; body: SiteStatus } | null = null;

export async function GET() {
  const now = Date.now();
  if (memo && now - memo.at < MEMO_MS) return Response.json(memo.body, { headers });
  let body: SiteStatus;
  try {
    body = await siteStatus(toolDeps().service, new Date());
  } catch (e) {
    console.error('[site-status] failed', e instanceof Error ? e.name : typeof e);
    body = { pilotMode: false, counters: null };
  }
  if (body.counters === null) return Response.json(body, { headers: degradedHeaders });
  memo = { at: now, body };
  return Response.json(body, { headers });
}
