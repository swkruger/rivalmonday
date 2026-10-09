import { toolkit } from '@cs/core';
import { ad } from '@cs/db';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { workspaceBusinesses } from '../workspace/business';
import { workspaceClient } from '../workspace/scope';
import { requireTracked } from './pages';
import { AdList, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

/** Decision 5: the public library page of an ad, or null when Google gave no advertiser id. */
export function libraryUrl(a: { platform: string; externalId: string; advertiserId: string | null }): string | null {
  if (a.platform === 'meta') return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(a.externalId)}`;
  if (a.platform === 'google' && a.advertiserId) {
    return `https://adstransparency.google.com/advertiser/${encodeURIComponent(a.advertiserId)}/creative/${encodeURIComponent(a.externalId)}`;
  }
  return null;
}

export const listAds = defineTool({
  name: 'list_ads',
  description: 'Ad creatives of tracked competitors (Meta and Google) with first and last seen dates; active ads first.',
  input: z.object({
    clientId: uuid,
    competitorId: uuid.optional(),
    platform: z.enum(['meta', 'google']).optional(),
    status: z.enum(['active', 'ended', 'all']).default('active'),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  output: AdList,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    if (input.competitorId) await requireTracked(deps.app, ctx, c.id, input.competitorId);
    const tracked = (await workspaceBusinesses(deps, ctx, c)).filter((b) => !b.self && (!input.competitorId || b.key === input.competitorId));
    if (tracked.length === 0) return { items: [], hasMore: false };
    const names = new Map(tracked.map((t) => [t.competitorId!, t.name]));
    const conds: SQL[] = [inArray(ad.competitorId, [...names.keys()])];
    if (input.platform) conds.push(eq(ad.platform, input.platform));
    if (input.status !== 'all') conds.push(eq(ad.isActive, input.status === 'active'));
    // Global `ad` rows — visibility proved by workspaceBusinesses (RLS).
    const rows = await deps.service.select().from(ad).where(and(...conds))
      .orderBy(desc(ad.isActive), desc(ad.lastSeenAt), desc(ad.id)).offset(input.offset).limit(input.limit + 1);
    return {
      items: rows.slice(0, input.limit).map((a) => ({
        id: a.id, competitorId: a.competitorId, competitorName: names.get(a.competitorId)!, platform: a.platform as 'meta' | 'google',
        format: a.format, title: a.title, text: a.text, landingUrl: a.landingUrl,
        firstSeenAt: a.firstSeenAt.toISOString(), lastSeenAt: a.lastSeenAt.toISOString(), endedAt: toIso(a.endedAt), active: a.isActive, libraryUrl: libraryUrl(a),
      })),
      hasMore: rows.length > input.limit,
    };
  },
});

export const adTools = [listAds];
