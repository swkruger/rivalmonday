import { type Db, type PlatformCostServiceRow, type PlatformCostSnapshotRow, platformCostService, platformCostSnapshot } from '@cs/db';
import { and, desc, gte, inArray } from 'drizzle-orm';
import type { SnapPoint } from './math';
import { type ServiceKey, SERVICES } from './types';

const num = (v: string | null): number | null => (v == null ? null : Number(v));

export const toSnapPoint = (r: PlatformCostSnapshotRow): SnapPoint => ({ takenAt: r.takenAt, status: r.status, amountUsd: num(r.amountUsd), capUsd: num(r.capUsd) });

export interface ServiceState {
  service: ServiceKey;
  /** null when the `platform_cost_service` row is missing (not seeded). */
  config: PlatformCostServiceRow | null;
  /** Newest snapshot, any age. */
  latest: PlatformCostSnapshotRow | null;
  /** Every snapshot since `since`, oldest first. */
  points: SnapPoint[];
}

/**
 * Config + newest snapshot + the snapshots since `since` for each of the six services (read model for the costs tools).
 *
 * Launch gate (Task 5): three queries, run together, whatever the number of services — the configs, the newest snapshot
 * per service (`DISTINCT ON`) and every snapshot since `since` — grouped here. A service with no rows keeps
 * `config: null` / `latest: null` / `points: []`.
 */
export async function loadCostState(db: Db, since: Date): Promise<ServiceState[]> {
  const services = Object.keys(SERVICES) as ServiceKey[];
  const [configs, latestRows, recent] = await Promise.all([
    db.select().from(platformCostService),
    db
      .selectDistinctOn([platformCostSnapshot.service])
      .from(platformCostSnapshot)
      .where(inArray(platformCostSnapshot.service, services))
      .orderBy(platformCostSnapshot.service, desc(platformCostSnapshot.takenAt)),
    db
      .select()
      .from(platformCostSnapshot)
      .where(and(inArray(platformCostSnapshot.service, services), gte(platformCostSnapshot.takenAt, since)))
      .orderBy(platformCostSnapshot.takenAt),
  ]);
  return services.map((service) => ({
    service,
    config: configs.find((c) => c.service === service) ?? null,
    latest: latestRows.find((r) => r.service === service) ?? null,
    points: recent.filter((r) => r.service === service).map(toSnapPoint),
  }));
}
