import { type AccessContext, toolkit } from '@cs/core';
import { platformSetting } from '@cs/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { SIGNUPS_PAUSED_KEY, signupsPaused } from '../access/signup';
import type { ToolDeps } from '../deps';
import { type PlatformRole, requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';

/**
 * Phase 10 Task 14: console controls for agency self-serve sign-up. Same pattern as platform-billing.ts: role check first
 * (a refusal never reaches the audit log, and surfaces as 404), then the body under one platform audit row.
 */
const { defineTool } = toolkit<ToolDeps>();

async function operate<T>(deps: ToolDeps, ctx: AccessContext, min: PlatformRole, tool: string, input: unknown, fn: () => Promise<T>): Promise<T> {
  const role = await requirePlatformOperator(deps, ctx, min);
  return withPlatformAudit(deps, ctx, { tool, input, role }, fn);
}

const Paused = z.object({ paused: z.boolean() });

export const getSignupsPausedTool = defineTool({
  name: 'get_signups_paused',
  access: 'read',
  description: 'Platform operators: whether open agency sign-up is paused.',
  input: z.object({}),
  output: Paused,
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'get_signups_paused', input, async () => ({ paused: await signupsPaused(deps.service) }));
  },
});

export const setSignupsPausedTool = defineTool({
  name: 'set_signups_paused',
  access: 'write',
  description: 'Platform owners: pause or resume open agency sign-up. Invite links are unaffected.',
  input: Paused,
  output: Paused,
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'owner', 'set_signups_paused', input, async () => {
      const value = { paused: input.paused };
      await deps.service
        .insert(platformSetting)
        .values({ key: SIGNUPS_PAUSED_KEY, value, updatedBy: ctx.userId })
        .onConflictDoUpdate({ target: platformSetting.key, set: { value, updatedAt: new Date(), updatedBy: ctx.userId } });
      return value;
    });
  },
});

const Counts = z.object({ signups: z.number().int(), profileDone: z.number().int(), firstClient: z.number().int(), cardAdded: z.number().int() });
export type FunnelCounts = z.infer<typeof Counts>;

export const getSignupFunnelTool = defineTool({
  name: 'get_signup_funnel',
  access: 'read',
  description: 'Platform operators: agencies created in the last 30 or 90 days by sign-up source (open or invite) and how far they got: profile done, first client, card added.',
  input: z.object({ days: z.union([z.literal(30), z.literal(90)]) }),
  output: z.object({ open: Counts, invite: Counts }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'get_signup_funnel', input, async () => {
      const since = new Date(Date.now() - input.days * 86_400_000);
      const rows = await deps.service.execute<{ source: string; signups: number; profile_done: number; first_client: number; card_added: number }>(sql`
        select o.source,
          count(*)::int as signups,
          (count(o.profile_done_at))::int as profile_done,
          (count(o.first_client_at))::int as first_client,
          (count(*) filter (where b.state = 'active'))::int as card_added
        from agency_onboarding o
        left join agency_billing b on b.agency_id = o.agency_id
        where o.created_at >= ${since.toISOString()}::timestamptz and o.source in ('open', 'invite')
        group by o.source`);
      const of = (source: string): FunnelCounts => {
        const r = [...rows].find((x) => x.source === source);
        return { signups: r?.signups ?? 0, profileDone: r?.profile_done ?? 0, firstClient: r?.first_client ?? 0, cardAdded: r?.card_added ?? 0 };
      };
      return { open: of('open'), invite: of('invite') };
    });
  },
});

export const platformSignupsTools = [getSignupsPausedTool, setSignupsPausedTool, getSignupFunnelTool];
