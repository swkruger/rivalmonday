import { type AccessContext, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { agencyServiceable, client, clientServiceable, playbookOverride, type ScoreThresholds, runbook, runbookItem, withTenant } from '@cs/db';
import {
  compareWithParent, copyItems, createClientRunbookIfAbsent, ensureAgencyRunbook, ensurePlatformRunbook, legacyClientItems, packUsesGenericPlays, PLAYBOOK_VARS,
  parseItemContent, readRunbookItems, type RunbookItem, type UpdateState, writeItem,
} from '@cs/engine';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { catalogOf, packsOf } from '../catalog/access';
import { enqueueOf, type ToolDeps } from '../deps';
import { type PlatformRole, requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { workspaceClient, type WorkspaceClient } from '../workspace/scope';
import { RunbookItemRow, RunbookItemView, RunbookOwner, RunbookTailoring } from './schemas';

/**
 * Phase 14b Task 6: the web tools behind the platform, agency and client runbook editors. Writes go through the service connection
 * (the runbook tables are service-only); every gate lives here and anything not allowed is `not_found`.
 */
const { defineTool } = toolkit<ToolDeps>();
const key = z.string().min(1).max(100);
const NOT_FOUND = () => new ToolError('not_found', 'Runbook not found');
const refuse = (msg: string) => new ToolError('invalid_input', msg, { userFacing: true });

type Level = 'platform' | 'agency' | 'client';
type Source = 'client' | 'agency' | 'legacy';

interface Target {
  level: Level;
  /** null: a client without a runbook (the items are the virtual base, read-only until "Create client runbook"). */
  runbookId: string | null;
  items: RunbookItem[];
  parent: RunbookItem[] | null;
  source?: Source;
  tailorStatus: string | null;
  client?: WorkspaceClient;
  platformRole?: PlatformRole;
}

const generic = (deps: ToolDeps) => catalogOf(deps).generic();

async function findRunbook(deps: ToolDeps, level: Level, ids: { agencyId?: string; clientId?: string }): Promise<{ id: string; tailorStatus: string | null } | undefined> {
  const where = level === 'platform' ? eq(runbook.level, 'platform')
    : level === 'agency' ? and(eq(runbook.level, 'agency'), eq(runbook.agencyId, ids.agencyId!))
    : and(eq(runbook.level, 'client'), eq(runbook.clientId, ids.clientId!));
  const [row] = await deps.service.select({ id: runbook.id, tailorStatus: runbook.tailorStatus }).from(runbook).where(where);
  return row;
}

/** Lazy creation (platform/agency); a read-only support session never writes, so it sees what exists. */
async function itemsOf(deps: ToolDeps, ctx: AccessContext, level: 'platform' | 'agency'): Promise<{ id: string | null; items: RunbookItem[] }> {
  if (ctx.support) {
    const row = await findRunbook(deps, level, { agencyId: ctx.agencyId });
    return row ? { id: row.id, items: await readRunbookItems(deps.service, row.id) } : { id: null, items: [] };
  }
  const g = await generic(deps);
  const id = level === 'platform' ? await ensurePlatformRunbook(deps.service, g) : await ensureAgencyRunbook(deps.service, ctx.agencyId, g);
  return { id, items: await readRunbookItems(deps.service, id) };
}

/** What a client without a runbook starts from (pre-flight ruling): the agency runbook for a generic-play pack without agency overrides, else the legacy view. */
async function clientBase(deps: ToolDeps, ctx: AccessContext, c: WorkspaceClient, agencyItems: RunbookItem[]): Promise<{ items: RunbookItem[]; source: Source }> {
  const pack = await packsOf(deps)(c.verticalId);
  const overrides = await deps.service.select({ id: playbookOverride.playbookId }).from(playbookOverride)
    .where(and(eq(playbookOverride.agencyId, ctx.agencyId), eq(playbookOverride.verticalId, pack.id))).limit(1);
  if (overrides.length === 0 && packUsesGenericPlays(pack, await generic(deps))) return { items: copyItems(agencyItems), source: 'agency' };
  return { items: await legacyClientItems({ db: deps.service, packs: packsOf(deps) }, c.id, agencyItems), source: 'legacy' };
}

async function resolve(deps: ToolDeps, ctx: AccessContext, owner: RunbookOwner, write: boolean): Promise<Target> {
  if (!isAgencyRole(ctx.role)) throw NOT_FOUND();
  if (owner.level === 'platform') {
    let platformRole: PlatformRole;
    try {
      platformRole = await requirePlatformOperator(deps, ctx, write ? 'staff' : 'viewer');
    } catch (e) {
      if (e instanceof ToolError && e.code === 'permission_denied') throw NOT_FOUND();
      throw e;
    }
    const p = await itemsOf(deps, ctx, 'platform');
    return { level: 'platform', runbookId: p.id, items: p.items, parent: null, tailorStatus: null, platformRole };
  }
  if (owner.level === 'agency') {
    if (write && ctx.role !== 'agency_admin') throw NOT_FOUND();
    const a = await itemsOf(deps, ctx, 'agency');
    const p = await itemsOf(deps, ctx, 'platform');
    return { level: 'agency', runbookId: a.id, items: a.items, parent: p.items, tailorStatus: null };
  }
  const c = await workspaceClient(deps, ctx, owner.clientId);
  const agency = await itemsOf(deps, ctx, 'agency');
  const own = await findRunbook(deps, 'client', { clientId: c.id });
  if (own) return { level: 'client', runbookId: own.id, items: await readRunbookItems(deps.service, own.id), parent: agency.items, source: 'client', tailorStatus: own.tailorStatus, client: c };
  const base = await clientBase(deps, ctx, c, agency.items);
  return { level: 'client', runbookId: null, items: base.items, parent: agency.items, source: base.source, tailorStatus: null, client: c };
}

const toView = (i: RunbookItem): z.input<typeof RunbookItemView> => ({
  key: i.key, kind: i.kind, content: i.content, enabled: i.enabled, businessAreaIds: i.businessAreaIds, version: i.version,
  customised: i.customised, upstreamVersion: i.upstreamVersion, dismissedUpstreamVersion: i.dismissedUpstreamVersion,
});

const need = (t: Target): string => {
  if (!t.runbookId) throw refuse('Create the client runbook first.');
  return t.runbookId;
};

async function reread(deps: ToolDeps, t: Target, k: string): Promise<z.input<typeof RunbookItemView>> {
  const row = (await readRunbookItems(deps.service, need(t))).find((i) => i.key === k);
  if (!row) throw NOT_FOUND();
  return toView(row);
}

async function mutate<T>(deps: ToolDeps, ctx: AccessContext, tool: string, input: unknown, owner: RunbookOwner, fn: (t: Target) => Promise<T>): Promise<T> {
  const t = await resolve(deps, ctx, owner, true);
  if (t.level === 'platform') return withPlatformAudit(deps, ctx, { tool, input, role: t.platformRole! }, () => fn(t));
  return fn(t);
}

const whole = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;

/** R3: the client's knob is `client.score_thresholds`, written with the `set_alert_rules` rules (null = back to the defaults). */
async function writeClientThresholds(deps: ToolDeps, ctx: AccessContext, clientId: string, value: ScoreThresholds | null): Promise<void> {
  if (value) {
    if (!whole(value.alert, 2, 100)) throw refuse('The alert threshold must be a whole number from 2 to 100.');
    if (!whole(value.brief, 1, 99)) throw refuse('The brief threshold must be a whole number from 1 to 99.');
    if (value.brief >= value.alert) throw refuse('The brief threshold must be lower than the alert threshold.');
  }
  const updated = await withTenant(deps.app, ctx, (tx) => tx.update(client).set({ scoreThresholds: value }).where(eq(client.id, clientId)).returning({ id: client.id }));
  if (updated.length === 0) throw NOT_FOUND();
}

const kindOf = (k: string): RunbookItem['kind'] | null => {
  const prefix = k.split(':')[0];
  return prefix === 'play' || prefix === 'self_rule' || prefix === 'knob' ? prefix : null;
};

const blank = (k: string, kind: RunbookItem['kind'], content: unknown): RunbookItem => ({
  key: k, kind, content, enabled: true, businessAreaIds: null, version: 1, upstreamVersion: null, upstreamSnapshot: null,
  dismissedUpstreamVersion: null, customised: false, removedUpstream: false,
});

const snapshotOf = (p: RunbookItem) => structuredClone({ content: p.content, enabled: p.enabled, businessAreaIds: p.businessAreaIds });

function checkAreas(t: Target, item: RunbookItem, ids: string[] | null | undefined): string[] | null {
  if (ids === undefined) return item.businessAreaIds;
  if (ids === null) return null;
  if (item.kind !== 'play') throw refuse('Only plays can be limited to services.');
  if (t.client) {
    const bad = ids.filter((a) => !t.client!.services.includes(a));
    if (bad.length > 0) throw refuse(`Unknown service: ${bad.join(', ')}`);
  }
  return ids;
}

const Items = z.array(RunbookItemRow);

export const getRunbook = defineTool({
  name: 'get_runbook',
  access: 'read',
  description: 'A runbook (platform, agency or one client): its plays, self-rules and settings, with where each stands against the level above.',
  input: z.object({ owner: RunbookOwner }),
  output: z.object({
    level: z.enum(['platform', 'agency', 'client']), source: z.enum(['client', 'agency', 'legacy']).optional(), tailorStatus: z.string().nullable(), items: Items,
    vars: z.array(z.string()), businessAreas: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  permission: 'agency',
  async handler(ctx, { owner }, deps) {
    const t = await resolve(deps, ctx, owner, false);
    let items = t.items;
    let businessAreas: { id: string; name: string }[] = [];
    if (t.client) {
      const c = t.client;
      const pack = await packsOf(deps)(c.verticalId);
      businessAreas = pack.services.filter((s) => c.services.includes(s.id)).map((s) => ({ id: s.id, name: s.name }));
      const [row] = await withTenant(deps.app, ctx, (tx) => tx.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, c.id)));
      const custom = row?.t;
      if (custom && items.some((i) => i.key === 'knob:thresholds')) items = items.map((i) => (i.key === 'knob:thresholds' ? { ...i, content: { alert: custom.alert, brief: custom.brief } } : i));
    }
    const parent = t.parent;
    const rows = parent
      ? compareWithParent(items, parent)
      : items.map((i) => ({ key: i.key, state: 'in_sync' as UpdateState, parentVersion: null }));
    const mine = new Map(items.map((i) => [i.key, i]));
    const theirs = new Map((parent ?? []).map((i) => [i.key, i]));
    const out = rows.map((r) => {
      const own = mine.get(r.key);
      const up = theirs.get(r.key);
      // A new upstream item is shown from the parent, switched off, until it is added.
      const base = own ?? { ...up!, enabled: false, version: 0, upstreamVersion: null, dismissedUpstreamVersion: null, customised: false };
      return { ...toView(base), state: r.state, parent: up ? { content: up.content, version: up.version } : null };
    });
    return { level: t.level, ...(t.source ? { source: t.source } : {}), tailorStatus: t.tailorStatus, items: out, vars: [...PLAYBOOK_VARS], businessAreas };
  },
});

export const updateRunbookItem = defineTool({
  name: 'update_runbook_item',
  access: 'write',
  description: 'Edit one runbook item (play wording, a self-rule or a setting) at the platform, agency or client level.',
  input: z.object({ owner: RunbookOwner, key, content: z.unknown(), businessAreaIds: z.array(z.string().max(40)).max(20).nullable().optional() }),
  output: RunbookItemView,
  permission: 'agency',
  async handler(ctx, input, deps) {
    return mutate(deps, ctx, 'update_runbook_item', input, input.owner, async (t) => {
      const runbookId = need(t);
      const existing = t.items.find((i) => i.key === input.key);
      const kind = existing?.kind ?? (input.key.startsWith('knob:') ? 'knob' : null);
      if (!kind) throw NOT_FOUND();
      const parsed = parseItemContent(kind, input.key, input.content);
      if (!parsed.ok) throw refuse(parsed.error);
      const item = existing ?? blank(input.key, kind, parsed.value);
      const next: RunbookItem = { ...item, content: parsed.value, businessAreaIds: checkAreas(t, item, input.businessAreaIds) };
      if (t.client && input.key === 'knob:thresholds') await writeClientThresholds(deps, ctx, t.client.id, parsed.value as ScoreThresholds);
      await writeItem(deps.service, runbookId, next, ctx.userId);
      return reread(deps, t, input.key);
    });
  },
});

export const setRunbookItemEnabled = defineTool({
  name: 'set_runbook_item_enabled',
  access: 'write',
  description: 'Switch one runbook item on or off.',
  input: z.object({ owner: RunbookOwner, key, enabled: z.boolean() }),
  output: RunbookItemView,
  permission: 'agency',
  async handler(ctx, input, deps) {
    return mutate(deps, ctx, 'set_runbook_item_enabled', input, input.owner, async (t) => {
      const runbookId = need(t);
      const item = t.items.find((i) => i.key === input.key);
      if (!item) throw NOT_FOUND();
      // Off = back to the defaults for the client's thresholds.
      if (t.client && input.key === 'knob:thresholds' && !input.enabled) await writeClientThresholds(deps, ctx, t.client.id, null);
      await writeItem(deps.service, runbookId, { ...item, enabled: input.enabled }, ctx.userId);
      return reread(deps, t, input.key);
    });
  },
});

export const pullRunbookUpdate = defineTool({
  name: 'pull_runbook_update',
  access: 'write',
  description: 'Take the newer version of an item from the level above. At the client level, pass the reviewed re-tailored text as content.',
  input: z.object({ owner: RunbookOwner, key, content: z.unknown().optional() }),
  output: RunbookItemView,
  permission: 'agency',
  async handler(ctx, input, deps) {
    return mutate(deps, ctx, 'pull_runbook_update', input, input.owner, async (t) => {
      const runbookId = need(t);
      const item = t.items.find((i) => i.key === input.key);
      const up = t.parent?.find((i) => i.key === input.key);
      if (!item || !up || up.kind !== item.kind) throw NOT_FOUND();
      let next: RunbookItem;
      if (input.content === undefined) {
        next = { ...item, content: structuredClone(up.content), enabled: up.enabled, businessAreaIds: up.businessAreaIds ? [...up.businessAreaIds] : null };
      } else {
        const parsed = parseItemContent(item.kind, item.key, input.content);
        if (!parsed.ok) throw refuse(parsed.error);
        next = { ...item, content: parsed.value };
      }
      next = { ...next, upstreamVersion: up.version, upstreamSnapshot: snapshotOf(up), dismissedUpstreamVersion: null, removedUpstream: false };
      if (t.client && input.key === 'knob:thresholds') await writeClientThresholds(deps, ctx, t.client.id, input.content === undefined ? null : (next.content as ScoreThresholds));
      await writeItem(deps.service, runbookId, next, ctx.userId);
      return reread(deps, t, input.key);
    });
  },
});

export const dismissRunbookUpdate = defineTool({
  name: 'dismiss_runbook_update',
  access: 'write',
  description: 'Keep your version of an item and hide the newer one from the level above.',
  input: z.object({ owner: RunbookOwner, key }),
  output: RunbookItemView,
  permission: 'agency',
  async handler(ctx, input, deps) {
    return mutate(deps, ctx, 'dismiss_runbook_update', input, input.owner, async (t) => {
      const runbookId = need(t);
      const item = t.items.find((i) => i.key === input.key);
      const up = t.parent?.find((i) => i.key === input.key);
      if (!item || !up) throw NOT_FOUND();
      await writeItem(deps.service, runbookId, { ...item, dismissedUpstreamVersion: up.version }, ctx.userId);
      return reread(deps, t, input.key);
    });
  },
});

/** The client runbook is created pending, then tailored by the worker; the enqueue happens after the commit and never fails the call. */
async function createClientRunbook(deps: ToolDeps, ctx: AccessContext, t: Target): Promise<void> {
  const c = t.client!;
  const made = await createClientRunbookIfAbsent(deps.service, c.id, t.items, ctx.userId);
  if (!made.created) return;
  const [live] = await deps.service.select({ id: client.id }).from(client).where(and(eq(client.id, c.id), clientServiceable(client), agencyServiceable(client.agencyId)));
  if (!live) return; // paused / inactive: the runbook exists untailored, no job
  await deps.service.update(runbook).set({ tailorStatus: 'pending' }).where(eq(runbook.id, made.id));
  try {
    await enqueueOf(deps)('runbook-tailor', { clientId: c.id }, `runbook-tailor:${c.id}`);
  } catch (err) {
    console.warn(`[add_runbook_item] runbook-tailor enqueue for ${c.id} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const addRunbookItem = defineTool({
  name: 'add_runbook_item',
  access: 'write',
  description: 'Adopt a new item from the level above. Key "*" on a client without a runbook creates the client runbook (a copy, then tailored in the background); it answers null.',
  input: z.object({ owner: RunbookOwner, key }),
  output: RunbookItemView.nullable(),
  permission: 'agency',
  async handler(ctx, input, deps) {
    return mutate(deps, ctx, 'add_runbook_item', input, input.owner, async (t) => {
      if (input.key === '*') {
        if (t.level !== 'client') throw NOT_FOUND();
        if (t.runbookId) throw refuse('This client already has a runbook.');
        await createClientRunbook(deps, ctx, t);
        return null;
      }
      const runbookId = need(t);
      const up = t.parent?.find((i) => i.key === input.key);
      if (!up || t.items.some((i) => i.key === input.key)) throw NOT_FOUND();
      await writeItem(deps.service, runbookId, copyItems([up])[0]!, ctx.userId);
      return reread(deps, t, input.key);
    });
  },
});

export const removeRunbookItem = defineTool({
  name: 'remove_runbook_item',
  access: 'write',
  description: 'Remove an item from a runbook. An item that exists in the level above stays as a switched-off row so it does not come back as new.',
  input: z.object({ owner: RunbookOwner, key }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    return mutate(deps, ctx, 'remove_runbook_item', input, input.owner, async (t) => {
      const runbookId = need(t);
      const item = t.items.find((i) => i.key === input.key);
      if (!item) throw NOT_FOUND();
      const up = t.parent?.find((i) => i.key === input.key);
      if (t.client && input.key === 'knob:thresholds') await writeClientThresholds(deps, ctx, t.client.id, null);
      if (up) await writeItem(deps.service, runbookId, { ...item, enabled: false, dismissedUpstreamVersion: up.version }, ctx.userId);
      else await deps.service.delete(runbookItem).where(and(eq(runbookItem.runbookId, runbookId), eq(runbookItem.itemKey, input.key)));
      return { ok: true as const };
    });
  },
});

export const retailorRunbookItem = defineTool({
  name: 'retailor_runbook_item',
  access: 'write', // one paid model call
  description: 'Ask for a re-tailored version of one play for this client, based on the newer text from the agency. Nothing is saved.',
  input: z.object({ owner: z.object({ level: z.literal('client'), clientId: z.string().uuid() }), key }),
  output: z.object({ proposed: RunbookTailoring.nullable() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    const t = await resolve(deps, ctx, input.owner, true);
    const up = t.parent?.find((i) => i.key === input.key);
    if (!up || up.kind !== 'play') throw NOT_FOUND();
    if (!deps.runbookTailorer) return { proposed: null };
    return { proposed: await deps.runbookTailorer({ clientId: t.client!.id, key: input.key, parentContent: up.content }) };
  },
});

export const runbookTools = [getRunbook, updateRunbookItem, setRunbookItemEnabled, pullRunbookUpdate, dismissRunbookUpdate, addRunbookItem, removeRunbookItem, retailorRunbookItem];
