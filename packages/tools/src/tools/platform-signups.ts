import { type AccessContext, toolkit } from '@cs/core';
import { platformSetting } from '@cs/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { CLIENTS_SERVED, hostKey, SIGNUPS_PAUSED_KEY, signupsPaused } from '../access/signup';
import type { ToolDeps } from '../deps';
import { type PlatformRole, requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { PILOT_MODE_KEY, pilotMode, SAMPLE_LIMIT_KEY, sampleBriefMonthlyLimit } from '../waitlist/settings';

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
/** D9 fence: staff-only per-agency sign-up row. `check` is a flag for staff to read, never a block. */
const Recent = z.object({
  agencyId: z.string(), agencyName: z.string(), source: z.enum(['open', 'invite']), createdAt: z.string(),
  website: z.string().nullable(), clientsServed: z.enum(CLIENTS_SERVED).nullable(), check: z.boolean(),
});
export type SignupRow = z.infer<typeof Recent>;
const RECENT_LIMIT = 100;

export const getSignupFunnelTool = defineTool({
  name: 'get_signup_funnel',
  access: 'read',
  description: 'Platform operators: agencies created in the last 30 or 90 days by sign-up source (open or invite) and how far they got: profile done, first client, card added; plus the newest sign-ups with website, clients served and the Check flag.',
  input: z.object({ days: z.union([z.literal(30), z.literal(90)]) }),
  output: z.object({ open: Counts, invite: Counts, recent: z.array(Recent) }),
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
      // D9: the website of the agency's earliest client is its own competitor row's domain.
      const recentRows = await deps.service.execute<{
        agency_id: string; name: string; source: 'open' | 'invite'; created_at: Date | string; clients_served: (typeof CLIENTS_SERVED)[number] | null;
        website: string | null; first_client_site: string | null;
      }>(sql`
        select o.agency_id, a.name, o.source, o.created_at, o.clients_served, p.website,
          (select comp.domain from client c left join competitor comp on comp.id = c.self_competitor_id
            where c.agency_id = o.agency_id order by c.created_at asc, c.id asc limit 1) as first_client_site
        from agency_onboarding o
        join agency a on a.id = o.agency_id
        left join agency_profile p on p.agency_id = o.agency_id
        where o.created_at >= ${since.toISOString()}::timestamptz and o.source in ('open', 'invite')
        order by o.created_at desc
        limit ${RECENT_LIMIT}`);
      const recent = [...recentRows].map((r): SignupRow => {
        const agencyHost = hostKey(r.website);
        const clientHost = hostKey(r.first_client_site);
        return {
          agencyId: r.agency_id, agencyName: r.name, source: r.source, createdAt: new Date(r.created_at).toISOString(),
          website: r.website, clientsServed: r.clients_served,
          check: r.clients_served === '0' || (agencyHost !== null && agencyHost === clientHost),
        };
      });
      return { open: of('open'), invite: of('invite'), recent };
    });
  },
});

export const getPilotSettingsTool = defineTool({
  name: 'get_pilot_settings',
  access: 'read',
  description: 'Platform operators: whether pilot mode is on (open agency sign-up closed, waitlist shown) and the monthly sample-brief approval limit.',
  input: z.object({}),
  output: z.object({ pilotMode: z.boolean(), sampleBriefMonthlyLimit: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'get_pilot_settings', input, async () => ({
      pilotMode: await pilotMode(deps.service),
      sampleBriefMonthlyLimit: await sampleBriefMonthlyLimit(deps.service),
    }));
  },
});

async function putSetting(deps: ToolDeps, ctx: AccessContext, key: string, value: Record<string, unknown>) {
  await deps.service
    .insert(platformSetting)
    .values({ key, value, updatedBy: ctx.userId })
    .onConflictDoUpdate({ target: platformSetting.key, set: { value, updatedAt: new Date(), updatedBy: ctx.userId } });
}

export const setPilotModeTool = defineTool({
  name: 'set_pilot_mode',
  access: 'write',
  description: 'Platform owners: turn pilot mode on or off. On closes open agency sign-up and shows the waitlist; invite links keep working.',
  input: z.object({ on: z.boolean() }),
  output: z.object({ on: z.boolean() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'owner', 'set_pilot_mode', input, async () => {
      const value = { on: input.on };
      await putSetting(deps, ctx, PILOT_MODE_KEY, value);
      return value;
    });
  },
});

export const setSampleBriefLimitTool = defineTool({
  name: 'set_sample_brief_limit',
  access: 'write',
  description: 'Platform owners: set how many sample briefs may be approved per month (0 to 100).',
  input: z.object({ n: z.number().int().min(0).max(100) }),
  output: z.object({ n: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'owner', 'set_sample_brief_limit', input, async () => {
      const value = { n: input.n };
      await putSetting(deps, ctx, SAMPLE_LIMIT_KEY, value);
      return value;
    });
  },
});

export const platformSignupsTools = [getSignupsPausedTool, setSignupsPausedTool, getSignupFunnelTool, getPilotSettingsTool, setPilotModeTool, setSampleBriefLimitTool];
