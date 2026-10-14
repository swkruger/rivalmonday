import { type Db, type PlatformCostServiceRow, type PlatformCostSnapshotRow, platformCostService, platformCostSnapshot } from '@cs/db';
import { and, desc, eq, gte } from 'drizzle-orm';
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

/** Config + newest snapshot + the snapshots since `since` for each of the six services (read model for the costs tools). */
export async function loadCostState(db: Db, since: Date): Promise<ServiceState[]> {
  const configs = await db.select().from(platformCostService);
  const out: ServiceState[] = [];
  for (const service of Object.keys(SERVICES) as ServiceKey[]) {
    const [latest] = await db.select().from(platformCostSnapshot).where(eq(platformCostSnapshot.service, service)).orderBy(desc(platformCostSnapshot.takenAt)).limit(1);
    const rows = await db
      .select()
      .from(platformCostSnapshot)
      .where(and(eq(platformCostSnapshot.service, service), gte(platformCostSnapshot.takenAt, since)))
      .orderBy(platformCostSnapshot.takenAt);
    out.push({ service, config: configs.find((c) => c.service === service) ?? null, latest: latest ?? null, points: rows.map(toSnapPoint) });
  }
  return out;
}
