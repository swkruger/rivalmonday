import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { client, type ScoreThresholds, withTenant } from '@cs/db';
import { validThresholds } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type ToolDeps, packsOf } from '../deps';
import { workspaceClient } from '../workspace/scope';
import { AlertRulesView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

async function view(deps: ToolDeps, verticalId: string, t: ScoreThresholds | null): Promise<AlertRulesView> {
  const d = (await packsOf(deps)(verticalId)).scoring.routing;
  const defaults = { alert: d.alert, brief: d.brief };
  return validThresholds(t) ? { alert: t.alert, brief: t.brief, custom: true, defaults } : { ...defaults, custom: false, defaults };
}

async function thresholdsOf(deps: ToolDeps, ctx: AccessContext, clientId: string) {
  const c = await workspaceClient(deps, ctx, clientId);
  const [row] = await withTenant(deps.app, ctx, (tx) => tx.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, c.id)));
  return { c, t: row?.t ?? null };
}

export const getAlertRules = defineTool({
  name: 'get_alert_rules',
  description: 'The score from which a competitor change becomes an instant alert, and from which it goes into the weekly brief.',
  input: z.object({ clientId: uuid }),
  output: AlertRulesView,
  permission: 'read',
  feature: 'alert_rules',
  async handler(ctx, { clientId }, deps) {
    const { c, t } = await thresholdsOf(deps, ctx, clientId);
    return view(deps, c.verticalId, t);
  },
});

const whole = (v: number | undefined, min: number, max: number) => v !== undefined && Number.isInteger(v) && v >= min && v <= max;

export const setAlertRules = defineTool({
  name: 'set_alert_rules',
  description: 'Change the alert and weekly-brief score thresholds for a client, or go back to the defaults. Applies to changes detected from now on.',
  input: z.object({ clientId: uuid, alert: z.number().optional(), brief: z.number().optional(), reset: z.boolean().default(false) }),
  output: AlertRulesView,
  permission: 'manage',
  feature: 'alert_rules',
  async handler(ctx, input, deps) {
    const { c } = await thresholdsOf(deps, ctx, input.clientId);
    let next: ScoreThresholds | null = null;
    if (!input.reset) {
      if (!whole(input.alert, 2, 100)) throw new ToolError('invalid_input', 'The alert threshold must be a whole number from 2 to 100.');
      if (!whole(input.brief, 1, 99)) throw new ToolError('invalid_input', 'The brief threshold must be a whole number from 1 to 99.');
      if (input.brief! >= input.alert!) throw new ToolError('invalid_input', 'The brief threshold must be lower than the alert threshold.');
      next = { alert: input.alert!, brief: input.brief! };
      if (!validThresholds(next)) throw new ToolError('invalid_input', 'Those thresholds are not valid.');
    }
    // `app_user` holds UPDATE (score_thresholds) — RLS scopes the row (decision 14).
    const updated = await withTenant(deps.app, ctx, (tx) => tx.update(client).set({ scoreThresholds: next }).where(eq(client.id, c.id)).returning({ id: client.id }));
    if (updated.length === 0) throw new ToolError('not_found', 'Client not found');
    return view(deps, c.verticalId, next);
  },
});

export const alertRuleTools = [getAlertRules, setAlertRules];
