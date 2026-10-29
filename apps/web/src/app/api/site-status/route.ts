import { type SiteStatus, siteStatus } from '@cs/tools';
import { toolDeps } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** Phase 17a: public pilot flag + rounded counters for the marketing site. Aggregates only; no auth, no PII. GET only. */
const headers = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
  'Access-Control-Allow-Origin': '*', // public aggregate data, no credentials (P6)
};

export async function GET() {
  let body: SiteStatus;
  try {
    body = await siteStatus(toolDeps().service, new Date());
  } catch (e) {
    console.error('[site-status] failed', e instanceof Error ? e.name : typeof e);
    body = { pilotMode: false, counters: null };
  }
  return Response.json(body, { headers });
}
