import { type Db, playbookOverride } from '@cs/db';
import { client } from '@cs/db';
import type { PackLoader } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { itemsFromPack, type RunbookItem } from './items';

/**
 * The client runbook that reproduces what the legacy path (pack plays + agency `playbook_override`s) shows today:
 * plays with overrides applied (a disabled override -> `enabled = false`), the pack's self-rules, no knobs, no AI.
 * Ids also in the agency runbook take its version/snapshot (`customised` = differs from the agency item); pack-only
 * ids are client-owned (`upstreamVersion` null); generic-only ids are absent so they surface as `new_upstream`.
 */
export async function legacyClientItems(deps: { db: Db; packs: PackLoader }, clientId: string, agencyItems: RunbookItem[]): Promise<RunbookItem[]> {
  const [c] = await deps.db.select({ agencyId: client.agencyId, verticalId: client.verticalId }).from(client).where(eq(client.id, clientId));
  if (!c) throw new Error(`Unknown client ${clientId}`);
  const pack = await deps.packs(c.verticalId);
  const overrides = await deps.db.select().from(playbookOverride).where(and(eq(playbookOverride.agencyId, c.agencyId), eq(playbookOverride.verticalId, pack.id)));
  const parents = new Map(agencyItems.map((i) => [i.key, i]));

  return itemsFromPack(pack).map((p): RunbookItem => {
    let { content, enabled } = p;
    if (p.kind === 'play') {
      const o = overrides.find((x) => `play:${x.playbookId}` === p.key);
      if (o) {
        if (o.disabledBy) enabled = false;
        content = { ...(content as object), ...(o.title !== null ? { title: o.title } : {}), ...(o.template !== null ? { template: o.template } : {}) };
      }
    }
    const parent = parents.get(p.key);
    const item: RunbookItem = {
      ...p, content, enabled, version: 1, upstreamVersion: null, upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: false, removedUpstream: false,
    };
    if (!parent || parent.kind !== p.kind) return item;
    return {
      ...item,
      upstreamVersion: parent.version,
      upstreamSnapshot: structuredClone({ content: parent.content, enabled: parent.enabled, businessAreaIds: parent.businessAreaIds }),
      customised: !(isDeepStrictEqual(content, parent.content) && enabled === parent.enabled),
    };
  });
}
