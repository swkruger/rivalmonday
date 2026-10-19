import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { client, type ScoreThresholds, withTenant } from '@cs/db';
import { defaultThresholds, validThresholds } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type ToolDeps, packsOf } from '../deps';
import { workspaceClient } from '../workspace/scope';
import { AlertRulesView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

async function view(deps: ToolDeps, agencyId: string, verticalId: string, t: ScoreThresholds | null): Promise<AlertRulesView> {
  const defaults = await defaultThresholds(deps.service, agencyId, await packsOf(deps)(verticalId));
  return validThresholds(t) ? { alert: t.alert, brief: t.brief, custom: true, defaults } : { ...defaults, custom: false, defaults };
}

async function thresholdsOf(deps: ToolDeps, ctx: AccessContext, clientId: string) {
  const c = await workspaceClient(deps, ctx, clientId);
  const [row] = await withTenant(deps.app, ctx, (tx) => tx.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, c.id)));
  return { c, t: row?.t ?? null };
}

export const getAlertRules = defineTool({
  name: 'get_alert_rules',
  access: 'read',
  description: 'The score from which a competitor change becomes an instant alert, and from which it goes into the weekly brief.',
  input: z.object({ clientId: uuid }),
  output: AlertRulesView,
  permission: 'read',
  feature: 'alert_rules',
  async handler(ctx, { clientId }, deps) {
    const { c, t } = await thresholdsOf(deps, ctx, clientId);
    return view(deps, ctx.agencyId, c.verticalId, t);
  },
});

const whole = (v: number | undefined, min: number, max: number) => v !== undefined && Number.isInteger(v) && v >= min && v <= max;

/** The one rule set for score thresholds (set_alert_rules and the runbook `knob:thresholds` at every level). */
export function validateThresholds(alert: number | undefined, brief: number | undefined): ScoreThresholds {
  if (!whole(alert, 2, 100)) throw new ToolError('invalid_input', 'The alert threshold must be a whole number from 2 to 100.', { userFacing: true });
  if (!whole(brief, 1, 99)) throw new ToolError('invalid_input', 'The brief threshold must be a whole number from 1 to 99.', { userFacing: true });
  if (brief! >= alert!) throw new ToolError('invalid_input', 'The brief threshold must be lower than the alert threshold.', { userFacing: true });
  const next = { alert: alert!, brief: brief! };
  if (!validThresholds(next)) throw new ToolError('invalid_input', 'Those thresholds are not valid.', { userFacing: true });
  return next;
}

/** `app_user` holds UPDATE (score_thresholds) — RLS scopes the row (decision 14). `next` must already be validated; null = back to the defaults. */
export async function applyClientThresholds(deps: ToolDeps, ctx: AccessContext, clientId: string, next: ScoreThresholds | null): Promise<void> {
  const updated = await withTenant(deps.app, ctx, (tx) => tx.update(client).set({ scoreThresholds: next }).where(eq(client.id, clientId)).returning({ id: client.id }));
  if (updated.length === 0) throw new ToolError('not_found', 'Client not found');
}

export const setAlertRules = defineTool({
  name: 'set_alert_rules',
  access: 'write',
  description: 'Change the alert and weekly-brief score thresholds for a client, or go back to the defaults. Applies to changes detected from now on.',
  input: z.object({ clientId: uuid, alert: z.number().optional(), brief: z.number().optional(), reset: z.boolean().default(false) }),
  output: AlertRulesView,
  permission: 'manage',
  channels: ['web', 'mcp'],
  mcpScope: 'manage',
  feature: 'alert_rules',
  async handler(ctx, input, deps) {
    const { c } = await thresholdsOf(deps, ctx, input.clientId);
    let next: ScoreThresholds | null = null;
    if (!input.reset) next = validateThresholds(input.alert, input.brief);
    await applyClientThresholds(deps, ctx, c.id, next);
    return view(deps, ctx.agencyId, c.verticalId, next);
  },
});

export const alertRuleTools = [getAlertRules, setAlertRules];
