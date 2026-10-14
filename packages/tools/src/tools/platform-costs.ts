import { type AccessContext, ToolError, toolkit } from '@cs/core';
import { platformCostItem, platformCostService } from '@cs/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, jobStatusOf, type ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { burnRate, daysLeft, loadCostState, manualMonthly, monthKeys, monthlySpend, type ServiceKey, SERVICES, serviceStatus, type ServiceStatus } from '../platform/costs';
import { toSnapPoint } from '../platform/costs/read';

/**
 * Phase 8c platform hosting costs (spec: owner-only). Every tool is `requirePlatformOperator(…, 'owner')` + `supportHidden`;
 * the platform audit row is written by `withPlatformAudit`, so the registry's web audit is skipped.
 */
const { defineTool } = toolkit<ToolDeps>();

const DAY_MS = 86_400_000;
const MONTHS = 6;
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string | null): number | null => (v == null ? null : Number(v));

const ServiceKeySchema = z.enum(Object.keys(SERVICES) as [ServiceKey, ...ServiceKey[]]);
const Url = z.string().url().max(500).refine((u) => u.startsWith('https://'), 'billingUrl must be https');
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const t = new Date(`${s}T00:00:00Z`).getTime();
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}, 'not a calendar date');
const Money2dp = z.number().min(0).max(1e7).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'at most 2 decimal places');

const ServiceRow = z.object({
  service: ServiceKeySchema,
  label: z.string(),
  kind: z.enum(['balance', 'usage']),
  unit: z.enum(['credits', 'CU-hours']).nullable(),
  status: z.enum(['ok', 'low', 'error', 'unavailable', 'not_configured', 'disabled']),
  amountUsd: z.number().nullable(),
  units: z.number().nullable(),
  capUsd: z.number().nullable(),
  daysLeft: z.number().nullable(),
  takenAt: z.string().nullable(),
  error: z.string().nullable(),
  billingUrl: z.string().nullable(),
  lowThresholdUsd: z.number().nullable(),
  warnDays: z.number(),
  unitRateUsd: z.number().nullable(),
  enabled: z.boolean(),
});

const CostItemRow = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['recurring', 'one_off']),
  amountUsd: z.number(),
  period: z.enum(['monthly', 'yearly']).nullable(),
  monthlyUsd: z.number().nullable(),
  startsOn: z.string(),
  endsOn: z.string().nullable(),
  billingUrl: z.string().nullable(),
  notes: z.string().nullable(),
});

const QUEUED = new Set(['created', 'retry', 'active']);

async function refreshQueued(deps: ToolDeps): Promise<boolean> {
  if (!deps.jobStatus) return false;
  const s = await deps.jobStatus('platform-costs-snapshot', 'platform-costs');
  return s != null && QUEUED.has(s.state);
}

export const listPlatformCosts = defineTool({
  name: 'list_platform_costs',
  access: 'read',
  description: 'Platform owners: vendor balances and usage, manual cost items, six-month spend and the month summary.',
  input: z.object({}),
  output: z.object({
    services: z.array(ServiceRow),
    items: z.array(CostItemRow),
    months: z.array(z.object({ month: z.string(), apiUsd: z.number(), manualUsd: z.number() })),
    summary: z.object({ mtdUsd: z.number(), projectedMonthUsd: z.number(), lowCount: z.number() }),
    refreshQueued: z.boolean(),
  }),
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requirePlatformOperator(deps, ctx, 'owner');
    return withPlatformAudit(deps, ctx, { tool: 'list_platform_costs', input, role }, async () => {
      const now = new Date();
      const months = monthKeys(now, MONTHS);
      const since = new Date(`${months[0]}-01T00:00:00Z`);
      const state = await loadCostState(deps.service, since);
      const allItems = await deps.service.select().from(platformCostItem).orderBy(asc(platformCostItem.name), asc(platformCostItem.id));
      const manual = allItems.map((i) => ({
        kind: i.kind, amountUsd: Number(i.amountUsd), period: i.period, startsOn: i.startsOn, endsOn: i.endsOn, archivedAt: i.archivedAt,
      }));

      const services = state.map((st) => {
        const meta = SERVICES[st.service];
        const cfg = st.config;
        const enabled = cfg?.enabled ?? true;
        const warnDays = cfg?.warnDays ?? 7;
        const lowThresholdUsd = num(cfg?.lowThresholdUsd ?? null);
        // Only the worker holds vendor credentials: a service is configured once the worker has written a snapshot.
        const configured = st.latest != null;
        const latest = st.latest ? toSnapPoint(st.latest) : null;
        const rate = meta.kind === 'balance' ? burnRate(st.points, now) : null;
        const status: ServiceStatus = serviceStatus({ enabled, configured, kind: meta.kind, latest, lowThresholdUsd, warnDays, rate });
        const shown = st.latest && status !== 'not_configured' ? st.latest : null;
        const amountUsd = num(shown?.amountUsd ?? null);
        return {
          service: st.service,
          label: meta.label,
          kind: meta.kind,
          unit: meta.unit ?? null,
          status,
          amountUsd,
          units: num(shown?.units ?? null),
          capUsd: num(shown?.capUsd ?? null),
          daysLeft: meta.kind === 'balance' && amountUsd != null ? daysLeft(amountUsd, rate) : null,
          takenAt: shown ? shown.takenAt.toISOString() : null,
          error: shown?.error ?? null,
          billingUrl: cfg?.billingUrl ?? null,
          lowThresholdUsd,
          warnDays,
          unitRateUsd: num(cfg?.unitRateUsd ?? null),
          enabled,
        };
      });

      const apiOf = (month: string) => round2(state.reduce((sum, st) => sum + monthlySpend(SERVICES[st.service].kind, st.points, month), 0));
      const monthRows = months.map((month) => ({ month, apiUsd: apiOf(month), manualUsd: manualMonthly(manual, month) }));
      const cur = monthRows[monthRows.length - 1]!;
      const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      const elapsedDays = Math.max(1, (now.getTime() - monthStart) / DAY_MS);

      return {
        services,
        items: allItems.filter((i) => i.archivedAt == null).map((i) => ({
          id: i.id,
          name: i.name,
          kind: i.kind,
          amountUsd: Number(i.amountUsd),
          period: i.period,
          monthlyUsd: i.kind === 'recurring' ? round2(i.period === 'yearly' ? Number(i.amountUsd) / 12 : Number(i.amountUsd)) : null,
          startsOn: i.startsOn,
          endsOn: i.endsOn,
          billingUrl: i.billingUrl,
          notes: i.notes,
        })),
        months: monthRows,
        summary: {
          mtdUsd: round2(cur.apiUsd + cur.manualUsd),
          projectedMonthUsd: round2((cur.apiUsd / elapsedDays) * daysInMonth + cur.manualUsd),
          lowCount: services.filter((s) => s.status === 'low').length,
        },
        refreshQueued: await refreshQueued(deps),
      };
    });
  },
});

export const refreshPlatformCosts = defineTool({
  name: 'refresh_platform_costs',
  access: 'write',
  description: 'Platform owners: queue a vendor balance refresh (the worker calls the vendors).',
  input: z.object({}),
  output: z.object({ queued: z.boolean() }),
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requirePlatformOperator(deps, ctx, 'owner');
    return withPlatformAudit(deps, ctx, { tool: 'refresh_platform_costs', input, role }, async () => {
      const enqueue = enqueueOf(deps);
      const status = await jobStatusOf(deps)('platform-costs-snapshot', 'platform-costs');
      if (status && QUEUED.has(status.state)) return { queued: false };
      await enqueue('platform-costs-snapshot', {}, 'platform-costs');
      return { queued: true };
    });
  },
});

export const updatePlatformCostService = defineTool({
  name: 'update_platform_cost_service',
  access: 'write',
  description: 'Platform owners: edit one vendor’s settings (enabled, billing link, low threshold, warning days, unit rate). Omitted fields are unchanged; null clears.',
  input: z.object({
    service: ServiceKeySchema,
    enabled: z.boolean().optional(),
    billingUrl: Url.nullish(),
    lowThresholdUsd: z.number().min(0).max(1e6).nullish(),
    warnDays: z.number().int().min(0).max(90).optional(),
    unitRateUsd: z.number().min(0).max(1000).nullish(),
  }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requirePlatformOperator(deps, ctx, 'owner');
    return withPlatformAudit(deps, ctx, { tool: 'update_platform_cost_service', input, role }, async () => {
      const set: Partial<typeof platformCostService.$inferInsert> = { updatedAt: new Date(), updatedBy: ctx.userId };
      if (input.enabled !== undefined) set.enabled = input.enabled;
      if (input.billingUrl !== undefined) set.billingUrl = input.billingUrl;
      if (input.lowThresholdUsd !== undefined) set.lowThresholdUsd = input.lowThresholdUsd === null ? null : input.lowThresholdUsd.toFixed(2);
      if (input.warnDays !== undefined) set.warnDays = input.warnDays;
      if (input.unitRateUsd !== undefined) set.unitRateUsd = input.unitRateUsd === null ? null : input.unitRateUsd.toFixed(8);
      const rows = await deps.service.update(platformCostService).set(set).where(eq(platformCostService.service, input.service)).returning({ service: platformCostService.service });
      if (rows.length === 0) throw new ToolError('not_found', 'Service not found');
      return { ok: true as const };
    });
  },
});

const SaveItemInput = z
  .object({
    id: Uuid.optional(),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['recurring', 'one_off']),
    amountUsd: Money2dp,
    period: z.enum(['monthly', 'yearly']).nullish(),
    startsOn: Ymd,
    endsOn: Ymd.nullish(),
    billingUrl: Url.nullish(),
    notes: z.string().max(500).nullish(),
  })
  .superRefine((v, c) => {
    if (v.kind === 'one_off') {
      if (v.period != null) c.addIssue({ code: 'custom', path: ['period'], message: 'A one-off has no period' });
      if (v.endsOn != null) c.addIssue({ code: 'custom', path: ['endsOn'], message: 'A one-off has no end date' });
    } else if (v.period == null) {
      c.addIssue({ code: 'custom', path: ['period'], message: 'A recurring item needs a period' });
    }
    if (v.endsOn != null && v.endsOn < v.startsOn) c.addIssue({ code: 'custom', path: ['endsOn'], message: 'endsOn is before startsOn' });
  });

export const savePlatformCostItem = defineTool({
  name: 'save_platform_cost_item',
  access: 'write',
  description: 'Platform owners: create a manual cost item, or update one by id.',
  input: SaveItemInput,
  output: z.object({ id: z.string() }),
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requirePlatformOperator(deps, ctx, 'owner');
    return withPlatformAudit(deps, ctx, { tool: 'save_platform_cost_item', input, role }, async () => {
      const values = {
        name: input.name,
        kind: input.kind,
        amountUsd: input.amountUsd.toFixed(2),
        period: input.kind === 'recurring' ? (input.period ?? null) : null,
        startsOn: input.startsOn,
        endsOn: input.kind === 'recurring' ? (input.endsOn ?? null) : null,
        billingUrl: input.billingUrl ?? null,
        notes: input.notes ?? null,
      };
      if (input.id) {
        const rows = await deps.service
          .update(platformCostItem)
          .set(values)
          .where(and(eq(platformCostItem.id, input.id), isNull(platformCostItem.archivedAt)))
          .returning({ id: platformCostItem.id });
        if (rows.length === 0) throw new ToolError('not_found', 'Cost item not found');
        return { id: input.id };
      }
      const [row] = await deps.service.insert(platformCostItem).values({ ...values, createdBy: ctx.userId }).returning({ id: platformCostItem.id });
      return { id: row!.id };
    });
  },
});

export const archivePlatformCostItem = defineTool({
  name: 'archive_platform_cost_item',
  access: 'write',
  description: 'Platform owners: archive a manual cost item (hidden from the list, still counted in past months).',
  input: z.object({ id: Uuid }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requirePlatformOperator(deps, ctx, 'owner');
    return withPlatformAudit(deps, ctx, { tool: 'archive_platform_cost_item', input, role }, async () => {
      const rows = await deps.service
        .update(platformCostItem)
        .set({ archivedAt: new Date() })
        .where(and(eq(platformCostItem.id, input.id), isNull(platformCostItem.archivedAt)))
        .returning({ id: platformCostItem.id });
      if (rows.length === 0) throw new ToolError('not_found', 'Cost item not found');
      return { ok: true as const };
    });
  },
});

export const platformCostTools = [listPlatformCosts, refreshPlatformCosts, updatePlatformCostService, savePlatformCostItem, archivePlatformCostItem];
