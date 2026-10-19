import { agency, client, type Db, runbook } from '@cs/db';
import { createClientRunbookIfAbsent, ensureAgencyRunbook, ensurePlatformRunbook, legacyClientItems, readRunbookItems, type RunbookItem } from '@cs/engine';
import type { PackLoader, VerticalPack } from '@cs/verticals';
import { and, eq, type SQL } from 'drizzle-orm';

export type BackfillCounts = { platformCreated: boolean; agenciesCreated: number; clientsCreated: number };

/**
 * Phase 14b legacy backfill: platform runbook, one per agency, and for every client without one (all statuses) a client
 * runbook that reproduces its legacy view (`tailor_status = 'skipped'`: no AI tailoring). Idempotent; never touches
 * `playbook_override`. `dryRun` counts what would be created and writes nothing.
 */
export async function runRunbookBackfill(
  deps: { db: Db; packs: PackLoader; generic: () => Promise<VerticalPack> },
  opts: { dryRun?: boolean } = {},
): Promise<BackfillCounts> {
  const { db } = deps;
  const generic = await deps.generic();
  const has = async (where: SQL | undefined) => (await db.select({ id: runbook.id }).from(runbook).where(where)).length > 0;
  const counts: BackfillCounts = { platformCreated: !(await has(eq(runbook.level, 'platform'))), agenciesCreated: 0, clientsCreated: 0 };
  if (!opts.dryRun) await ensurePlatformRunbook(db, generic);

  for (const { id: agencyId } of await db.select({ id: agency.id }).from(agency)) {
    if (!(await has(and(eq(runbook.level, 'agency'), eq(runbook.agencyId, agencyId))))) counts.agenciesCreated++;
    if (!opts.dryRun) await ensureAgencyRunbook(db, agencyId, generic);
  }

  const agencyItems = new Map<string, RunbookItem[]>();
  for (const c of await db.select({ id: client.id, agencyId: client.agencyId }).from(client)) {
    if (await has(and(eq(runbook.level, 'client'), eq(runbook.clientId, c.id)))) continue;
    counts.clientsCreated++;
    if (opts.dryRun) continue;
    if (!agencyItems.has(c.agencyId)) agencyItems.set(c.agencyId, await readRunbookItems(db, await ensureAgencyRunbook(db, c.agencyId, generic)));
    const items = await legacyClientItems({ db, packs: deps.packs }, c.id, agencyItems.get(c.agencyId)!);
    await createClientRunbookIfAbsent(db, c.id, items, 'system', 'skipped');
  }
  return counts;
}
