import { client, type Db, playbookOverride, runbook, runbookItem } from '@cs/db';
import type { PackLoader, VerticalPack } from '@cs/verticals';
import { and, eq, sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { resolveLegacyPlaybooks } from '../briefs/playbooks';
import { itemsFromPack, parseItemContent, type RunbookItem } from './items';
import { copyItems, type EffectiveRunbook, effectiveFrom, packUsesGenericPlays } from './state';

const SYSTEM = 'system';
type Row = typeof runbookItem.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const toItem = (r: Row): RunbookItem => ({
  key: r.itemKey, kind: r.kind, content: r.content, enabled: r.enabled, businessAreaIds: r.businessAreaIds,
  version: r.version, upstreamVersion: r.upstreamVersion, upstreamSnapshot: r.upstreamSnapshot,
  dismissedUpstreamVersion: r.dismissedUpstreamVersion, customised: r.customised, removedUpstream: r.removedUpstream,
});
const toRow = (runbookId: string, i: RunbookItem, by: string): typeof runbookItem.$inferInsert => ({
  runbookId, itemKey: i.key, kind: i.kind, content: i.content, enabled: i.enabled, businessAreaIds: i.businessAreaIds,
  version: i.version, upstreamVersion: i.upstreamVersion, upstreamSnapshot: i.upstreamSnapshot,
  dismissedUpstreamVersion: i.dismissedUpstreamVersion, customised: i.customised, removedUpstream: i.removedUpstream, updatedBy: by,
});

export async function readRunbookItems(service: Db, runbookId: string): Promise<RunbookItem[]> {
  const rows = await service.select().from(runbookItem).where(eq(runbookItem.runbookId, runbookId)).orderBy(runbookItem.itemKey);
  return rows.map(toItem);
}

/** Items that fail their schema are skipped with a warning, never fatal (Review Focus 2). */
function validItems(items: RunbookItem[], runbookId: string): RunbookItem[] {
  return items.filter((i) => {
    const r = parseItemContent(i.kind, i.key, i.content);
    if (!r.ok) console.warn(`[runbook] skipping invalid item ${i.key} in ${runbookId}: ${r.error}`);
    return r.ok;
  });
}

/** Inserts the runbook and its items in one transaction; a concurrent loser blocks on the unique index until the winner commits. */
async function insertRunbook(
  service: Db,
  owner: { level: 'platform' | 'agency' | 'client'; agencyId?: string; clientId?: string; tailorStatus?: 'pending' },
  buildItems: (tx: Tx) => Promise<RunbookItem[]>,
  by: string,
): Promise<{ id: string; created: boolean }> {
  const existing = () =>
    service.select({ id: runbook.id }).from(runbook).where(
      owner.level === 'platform' ? eq(runbook.level, 'platform')
        : owner.level === 'agency' ? and(eq(runbook.level, 'agency'), eq(runbook.agencyId, owner.agencyId!))
        : and(eq(runbook.level, 'client'), eq(runbook.clientId, owner.clientId!)),
    );
  const found = await existing();
  if (found[0]) return { id: found[0].id, created: false };
  const created = await service.transaction(async (tx) => {
    const [row] = await tx.insert(runbook).values({ level: owner.level, agencyId: owner.agencyId ?? null, clientId: owner.clientId ?? null, tailorStatus: owner.tailorStatus ?? null }).onConflictDoNothing().returning({ id: runbook.id });
    if (!row) return null;
    const items = await buildItems(tx);
    if (items.length) await tx.insert(runbookItem).values(items.map((i) => toRow(row.id, i, by)));
    return row.id;
  });
  if (created) return { id: created, created: true };
  const [again] = await existing();
  if (!again) throw new Error('runbook insert conflicted but no row found');
  return { id: again.id, created: false };
}

const base = (i: Pick<RunbookItem, 'key' | 'kind' | 'content' | 'enabled' | 'businessAreaIds'>): RunbookItem => ({
  ...i, version: 1, upstreamVersion: null, upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: false, removedUpstream: false,
});

export async function ensurePlatformRunbook(service: Db, generic: VerticalPack): Promise<string> {
  return insertRunbook(service, { level: 'platform' }, async () => {
    const { alert, brief } = generic.scoring.routing;
    return [
      ...itemsFromPack(generic).map(base),
      base({ key: 'knob:thresholds', kind: 'knob', content: { alert, brief }, enabled: true, businessAreaIds: null }),
    ];
  }, SYSTEM).then((r) => r.id);
}

export async function ensureAgencyRunbook(service: Db, agencyId: string, generic: VerticalPack): Promise<string> {
  const platformId = await ensurePlatformRunbook(service, generic);
  return insertRunbook(service, { level: 'agency', agencyId }, async (tx) => {
    const rows = await tx.select().from(runbookItem).where(eq(runbookItem.runbookId, platformId));
    return copyItems(rows.map(toItem));
  }, SYSTEM).then((r) => r.id);
}

/** Like `createClientRunbook`, but reports whether this call inserted the row (false: another path created it first, nothing was written). */
export async function createClientRunbookIfAbsent(service: Db, clientId: string, items: RunbookItem[], by: string, tailorStatus?: 'pending'): Promise<{ id: string; created: boolean }> {
  const [c] = await service.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, clientId));
  if (!c) throw new Error(`Unknown client ${clientId}`);
  return insertRunbook(service, { level: 'client', agencyId: c.agencyId, clientId, tailorStatus }, async () => items, by);
}

export async function createClientRunbook(service: Db, clientId: string, items: RunbookItem[], by: string): Promise<string> {
  return (await createClientRunbookIfAbsent(service, clientId, items, by)).id;
}

/** Bumps `version` on an existing key (new keys keep `item.version`); `customised` = the stored state differs from `upstreamSnapshot`. */
export async function writeItem(service: Db, runbookId: string, item: RunbookItem, by: string): Promise<void> {
  const snap = item.upstreamSnapshot as { content: unknown; enabled: boolean; businessAreaIds: string[] | null } | null;
  const customised = snap
    ? !(isDeepStrictEqual(snap.content, item.content) && snap.enabled === item.enabled && isDeepStrictEqual(snap.businessAreaIds ?? null, item.businessAreaIds ?? null))
    : item.customised;
  const v = toRow(runbookId, { ...item, customised }, by);
  await service.insert(runbookItem).values(v).onConflictDoUpdate({
    target: [runbookItem.runbookId, runbookItem.itemKey],
    set: {
      kind: v.kind, content: v.content, enabled: v.enabled, businessAreaIds: v.businessAreaIds,
      version: sql`${runbookItem.version} + 1`, upstreamVersion: v.upstreamVersion, upstreamSnapshot: v.upstreamSnapshot,
      dismissedUpstreamVersion: v.dismissedUpstreamVersion, customised, removedUpstream: v.removedUpstream, updatedBy: by, updatedAt: new Date(),
    },
  });
}

async function itemsWhere(db: Db, where: ReturnType<typeof and>): Promise<RunbookItem[] | null> {
  const [rb] = await db.select({ id: runbook.id }).from(runbook).where(where);
  if (!rb) return null;
  return validItems(await readRunbookItems(db, rb.id), rb.id);
}

const thresholdOf = (items: RunbookItem[] | null) =>
  (items?.find((i) => i.key === 'knob:thresholds' && i.enabled)?.content as { alert: number; brief: number } | undefined) ?? null;

/** R3 default thresholds without the client column: agency knob, then platform knob, then the pack's routing (what the engine uses for a client with no custom thresholds). */
export async function defaultThresholds(db: Db, agencyId: string, pack: VerticalPack): Promise<{ alert: number; brief: number }> {
  const agencyItems = await itemsWhere(db, and(eq(runbook.level, 'agency'), eq(runbook.agencyId, agencyId)));
  const platformItems = await itemsWhere(db, eq(runbook.level, 'platform'));
  return thresholdOf(agencyItems) ?? thresholdOf(platformItems) ?? { alert: pack.scoring.routing.alert, brief: pack.scoring.routing.brief };
}

/** Resolution order (R2): client runbook, legacy when the agency has overrides for the vertical, agency runbook for generic-play packs, else legacy. */
export async function loadClientRunbook(deps: { db: Db; packs: PackLoader; generic?: () => Promise<VerticalPack> }, clientId: string): Promise<EffectiveRunbook> {
  const { db } = deps;
  const [c] = await db.select({ agencyId: client.agencyId, verticalId: client.verticalId, services: client.services, scoreThresholds: client.scoreThresholds }).from(client).where(eq(client.id, clientId));
  if (!c) throw new Error(`Unknown client ${clientId}`);
  const pack = await deps.packs(c.verticalId);
  const agencyItems = await itemsWhere(db, and(eq(runbook.level, 'agency'), eq(runbook.agencyId, c.agencyId)));
  const platformItems = await itemsWhere(db, eq(runbook.level, 'platform'));
  // R3: client column, then agency knob, then platform knob, then the pack's routing.
  const thresholds = c.scoreThresholds ?? thresholdOf(agencyItems) ?? thresholdOf(platformItems) ?? { alert: pack.scoring.routing.alert, brief: pack.scoring.routing.brief };

  const clientItems = await itemsWhere(db, and(eq(runbook.level, 'client'), eq(runbook.clientId, clientId)));
  if (clientItems) return { ...effectiveFrom(clientItems, 'client', c.services), thresholds };

  const overrides = await db.select({ id: playbookOverride.playbookId }).from(playbookOverride)
    .where(and(eq(playbookOverride.agencyId, c.agencyId), eq(playbookOverride.verticalId, pack.id))).limit(1);
  // Without a `generic` loader (tests, tools that never wired it) the agency runbook cannot be validated, so the legacy view applies.
  if (overrides.length === 0 && agencyItems && deps.generic && packUsesGenericPlays(pack, await deps.generic())) {
    return { ...effectiveFrom(agencyItems, 'agency', c.services), thresholds };
  }
  const plays = await resolveLegacyPlaybooks(db, c.agencyId, pack);
  return {
    source: 'legacy',
    // resolveLegacyPlaybooks spreads the pack play, so effort/impact already ride along.
    plays: plays.map((p) => ({ ...p, version: 0, businessAreaIds: null })),
    selfRules: pack.self_rules,
    thresholds,
    focusAreaIds: [],
    tierLimits: null,
  };
}
