import { toolkit, ToolError } from '@cs/core';
import { withTenant } from '@cs/db';
import { countOpenReviews } from '@cs/engine';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { countAlertsAwaitingReview } from './alert-queue';
import { countNewLeads } from './leads';
import { waitlistCounts } from './platform-waitlist';
import { countBriefsAwaitingReview } from './review';
import { countPendingTopicProposals } from './topics';

// Phase 15a P2: the sidebar's badge counts, one audited web call per shell render each (never a `list_*` per queue).
// Every count reuses the WHERE helper of the list its page shows, so a badge never disagrees with the page. Ask reviews
// has no badge (threads have no reviewed state, so there is no queue to count).

const { defineTool } = toolkit<ToolDeps>();
const n = z.number().int().nonnegative();

export const getNavCounts = defineTool({
  name: 'get_nav_counts',
  access: 'read',
  description: 'Badge counts for the agency menu: briefs waiting for approval, alerts waiting for a check, and new leads (users who cover all clients).',
  input: z.object({}),
  output: z.object({ approvals: n, alerts: n, leads: n }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    // RLS scopes briefs and alerts to the caller's clients (an AM scoped to some clients counts only theirs); inside a
    // support session `ctx` is the supported agency's.
    return withTenant(deps.app, ctx, async (tx) => ({
      approvals: await countBriefsAwaitingReview(tx),
      alerts: await countAlertsAwaitingReview(tx),
      leads: await countNewLeads(tx, ctx),
    }));
  },
});

export const getPlatformNavCounts = defineTool({
  name: 'get_platform_nav_counts',
  access: 'read',
  description: 'Platform operators: badge counts for the platform menu — open model reviews and pending topic proposals.',
  input: z.object({}),
  output: z.object({ modelReviews: n, topics: n, waitlist: n }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    try {
      await requirePlatformOperator(deps, ctx);
    } catch (e) {
      // The shell calls this for operators only; anyone else is told it doesn't exist, like an unknown tool.
      if (e instanceof ToolError && e.code === 'permission_denied') throw new ToolError('not_found', 'Unknown tool: get_platform_nav_counts');
      throw e;
    }
    // Waitlist badge = confirmed new entries + confirmed sample requests (the same helper the Waitlist page's tab counts use).
    const w = await waitlistCounts(deps.service);
    return {
      modelReviews: await countOpenReviews(deps.service),
      topics: await countPendingTopicProposals(deps.service),
      waitlist: w.agencyNew + w.businessNew + w.sampleRequested,
    };
  },
});

export const navCountTools = [getNavCounts, getPlatformNavCounts];
