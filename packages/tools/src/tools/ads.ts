import { appLinkFor, toolkit } from '@cs/core';
import { ad, evidence } from '@cs/db';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { detailOf, pageOf, pageResult } from '../paging';
import { workspaceBusinesses } from '../workspace/business';
import { citableEvidenceKinds } from '../workspace/events-read';
import { forChannel } from '../workspace/model-text';
import { workspaceClient } from '../workspace/scope';
import { requireTracked } from './pages';
import { AdPage, pageFields, toIso } from './schemas';

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
    offset: z.number().int().min(0).max(5000).default(0),
    limit: z.number().int().min(1).max(100).optional(),
    ...pageFields,
  }),
  output: AdPage,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, input, deps, meta) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const paged = pageOf(input, meta, 50);
    const limit = paged.limit;
    const offset = input.cursor ? paged.offset : input.offset;
    if (input.competitorId) await requireTracked(deps.app, ctx, c.id, input.competitorId);
    const tracked = (await workspaceBusinesses(deps, ctx, c)).filter((b) => !b.self && (!input.competitorId || b.key === input.competitorId));
    if (tracked.length === 0) return { items: [], hasMore: false };
    const names = new Map(tracked.map((t) => [t.competitorId!, t.name]));
    const conds: SQL[] = [inArray(ad.competitorId, [...names.keys()])];
    if (input.platform) conds.push(eq(ad.platform, input.platform));
    if (input.status !== 'all') conds.push(eq(ad.isActive, input.status === 'active'));
    // Global `ad` rows — visibility proved by workspaceBusinesses (RLS).
    const rows = await deps.service.select().from(ad).where(and(...conds))
      .orderBy(desc(ad.isActive), desc(ad.lastSeenAt), desc(ad.id)).offset(offset).limit(limit + 1);
    const page = pageResult(rows, limit, offset);
    if (detailOf(input, meta) === 'summary') {
      // The ad's citable capture evidence (first sighting, else latest), as eventEvidenceIds; global rows, visibility proved above.
      const captureOf = new Map(page.rows.map((a) => [a.id, a.firstCaptureId ?? a.lastCaptureId]));
      const captureIds = [...new Set([...captureOf.values()].filter((v): v is string => !!v))];
      const ev = captureIds.length
        ? await deps.service.select({ captureId: evidence.captureId, id: evidence.id }).from(evidence)
          .where(and(inArray(evidence.captureId, captureIds), inArray(evidence.kind, citableEvidenceKinds(meta)))).orderBy(asc(evidence.kind), asc(evidence.id))
        : [];
      return {
        items: page.rows.map((a) => {
          const name = names.get(a.competitorId)!;
          const cap = captureOf.get(a.id);
          return {
            id: a.id, title: forChannel(meta, a.title ?? a.text?.slice(0, 80) ?? `${a.platform} ad`, [name]), date: a.firstSeenAt.toISOString(),
            evidenceIds: cap ? ev.filter((e) => e.captureId === cap).map((e) => e.id) : [],
            url: appLinkFor(deps.appUrl, { t: 'competitor', clientId: c.id, id: a.competitorId }),
          };
        }),
        hasMore: page.hasMore, nextCursor: page.nextCursor,
      };
    }
    return {
      items: page.rows.map((a) => ({
        id: a.id, competitorId: a.competitorId, competitorName: names.get(a.competitorId)!, platform: a.platform as 'meta' | 'google',
        format: a.format, title: forChannel(meta, a.title, [names.get(a.competitorId)]), text: forChannel(meta, a.text, [names.get(a.competitorId)]), landingUrl: a.landingUrl,
        firstSeenAt: a.firstSeenAt.toISOString(), lastSeenAt: a.lastSeenAt.toISOString(), endedAt: toIso(a.endedAt), active: a.isActive, libraryUrl: libraryUrl(a),
      })),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  },
});

export const adTools = [listAds];
