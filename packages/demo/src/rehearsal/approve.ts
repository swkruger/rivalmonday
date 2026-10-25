import { createAccessContext } from '@cs/core';
import { brief, client, type Db } from '@cs/db';
import type { DeliveryConfig } from '@cs/engine';
import { createToolRegistry } from '@cs/tools';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { RehearsalManifest } from './manifest';

/**
 * The owner's Friday ~14:00 step: every `ready` brief of an auto-send-off rehearsal client is approved as its agency's
 * admin through the tool registry (`approve_brief`) — the same path web `runTool` wraps, audit row included — never by
 * calling the engine directly. One failure does not stop the rest; each is reported.
 */
export async function approveRehearsalBriefs(
  deps: { app: Db; service: Db; delivery?: DeliveryConfig | null },
  manifest: RehearsalManifest,
): Promise<{ approved: number; failed: { briefId: string; error: string }[] }> {
  const clientIds = [...manifest.weeklyClientIds, ...manifest.startingPointClientIds];
  if (clientIds.length === 0) return { approved: 0, failed: [] };
  const rows = await deps.service.select({ briefId: brief.id, agencyId: brief.agencyId }).from(brief)
    .innerJoin(client, eq(client.id, brief.clientId))
    .where(and(inArray(brief.clientId, clientIds), eq(brief.status, 'ready'), eq(client.briefAutoSend, false)))
    .orderBy(asc(brief.agencyId), asc(brief.deliveryDate));
  const registry = createToolRegistry({ app: deps.app, service: deps.service, delivery: deps.delivery ?? null });
  const admins = new Map(manifest.agencies.map((a) => [a.id, a.adminUserId]));
  let approved = 0;
  const failed: { briefId: string; error: string }[] = [];
  for (const r of rows) {
    const userId = admins.get(r.agencyId);
    if (!userId) {
      failed.push({ briefId: r.briefId, error: `agency ${r.agencyId} is not in the manifest` });
      continue;
    }
    const ctx = createAccessContext({ agencyId: r.agencyId, userId, role: 'agency_admin', clientScope: 'all', features: [] });
    try {
      await registry.invoke(ctx, 'approve_brief', { briefId: r.briefId });
      approved++;
    } catch (err) {
      failed.push({ briefId: r.briefId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { approved, failed };
}
