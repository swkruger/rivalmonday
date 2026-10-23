import type { RankScanSkipped } from '@cs/collectors';
import type { Db } from '@cs/db';
import { type DeliveryConfig, loadBranding, notify } from './outbox';

/** ISO date (UTC) of the Monday that starts `now`'s week. */
function mondayOfUtcWeek(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Agency notice for a rank scan skipped by the monthly credit limit; at most one per client per UTC week. */
export async function notifyRankScanSkipped(deps: { db: Db; delivery: DeliveryConfig }, s: RankScanSkipped, now: Date = new Date()): Promise<number> {
  const branding = await loadBranding(deps.db, s.agencyId);
  const title = `Rank scan skipped: ${s.clientName}`;
  const lines = [`${s.clientName} is close to this month's credit limit, so this scan can't run until next month.`];
  const n = await notify(deps.db, deps.delivery, {
    agencyId: s.agencyId, clientId: s.clientId, kind: 'rank_scan_skipped', audience: 'agency', subjectType: 'rank_scan', subjectId: s.scanId,
    dedupe: `rank_scan_skipped:${s.clientId}:${mondayOfUtcWeek(now)}`, link: { t: 'notifications', id: s.scanId }, now,
    build: (rec, link) => ({ title, body: lines.join('\n'), email: { template: 'agency_notice', props: { branding, recipientName: rec?.name ?? null, clientName: s.clientName, notice: 'rank_scan_skipped', title, lines, link, actionLabel: 'Open inbox' } } }),
  });
  return n > 0 ? 1 : 0;
}
