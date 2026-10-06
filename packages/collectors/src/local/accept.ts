import { canManageCompetitors, type AccessContext, ToolError } from '@cs/core';
import { client, clientCompetitor, competitor, competitorSuggestion, type Db, withTenant } from '@cs/db';
import { and, eq, isNull } from 'drizzle-orm';
import { ensureCompetitorSources } from '../sources/ensure';

type CompetitorRow = typeof competitor.$inferSelect;

/**
 * Place-first, conflict-safe match: a shared placeId or cid is a reliable merge signal, but a
 * shared domain is not (franchise brands, facebook.com, …) — only merge on domain when the
 * existing row has no place_id of its own that a different domain match could clobber.
 */
export async function findExistingCompetitor(
  service: Db,
  s: { placeId: string | null; cid: string | null; domain: string | null },
): Promise<CompetitorRow | undefined> {
  if (s.placeId) {
    const [byPlace] = await service.select().from(competitor).where(eq(competitor.placeId, s.placeId)).limit(1);
    if (byPlace) return byPlace;
  }
  if (s.cid) {
    const [byCid] = await service.select().from(competitor).where(eq(competitor.cid, s.cid)).limit(1);
    if (byCid) return byCid;
  }
  if (s.domain) {
    const [byDomain] = await service.select().from(competitor).where(and(eq(competitor.domain, s.domain), isNull(competitor.placeId))).limit(1);
    if (byDomain) return byDomain;
  }
  return undefined;
}

/**
 * Applied when a new link reuses an existing global competitor row (accepting a suggestion, or `add_competitor`).
 * Backfills only columns the row is missing — never overwrites a value it already has — and, if the row is any
 * client's self business, replaces its name with `source.name` (see the comment below).
 * `backfill: false` applies only that rename: `add_competitor` passes user-typed identifiers, which must never be
 * written onto a shared row another agency already collects for (re-review of the final fix).
 */
export async function patchReusedCompetitor(
  service: Db,
  existing: CompetitorRow,
  source: { placeId: string | null; cid: string | null; domain: string | null; name: string | null },
  { backfill = true }: { backfill?: boolean } = {},
): Promise<void> {
  const competitorId = existing.id;
  const patch: { placeId?: string; cid?: string; domain?: string; name?: string } = {};
  if (backfill && !existing.placeId && source.placeId) patch.placeId = source.placeId;
  if (backfill && !existing.cid && source.cid) patch.cid = source.cid;
  if (backfill && !existing.domain && source.domain) {
    // Same guard as acceptSuggestion's insert branch: don't steal a domain another competitor row already owns.
    const [domainClash] = await service.select().from(competitor).where(eq(competitor.domain, source.domain)).limit(1);
    if (!domainClash) patch.domain = source.domain;
  }
  // A row reused as a client's self business (ensureSelfCompetitor) was named from that client's own
  // `client.name` — tenant-private data that must never leak to a second agency reusing the same row. If this
  // row is anyone's self business, replace the name with the caller's (the GBP title of a suggestion, or the
  // name typed into add_competitor), which is the second agency's own data, not the first agency's.
  const [selfRef] = await service.select({ id: client.id }).from(client).where(eq(client.selfCompetitorId, competitorId)).limit(1);
  if (selfRef && source.name) patch.name = source.name;
  if (Object.keys(patch).length > 0) {
    await service.update(competitor).set(patch).where(eq(competitor.id, competitorId));
  }
}

/** Visibility is checked through RLS as the caller; the global competitor is written by the service role. */
export async function acceptSuggestion(deps: { service: Db; app: Db }, ctx: AccessContext, suggestionId: string): Promise<{ competitorId: string }> {
  if (!canManageCompetitors(ctx)) throw new ToolError('permission_denied', 'This role may not manage competitors');
  const [s] = await withTenant(deps.app, ctx, (tx) => tx.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, suggestionId)).limit(1));
  if (!s) throw new ToolError('not_found', 'Suggestion not found');

  let competitorId: string;
  const existing = await findExistingCompetitor(deps.service, s);
  if (existing) {
    competitorId = existing.id;
    await patchReusedCompetitor(deps.service, existing, s);
  } else {
    // A different competitor may already hold this domain (with a different place_id, so it
    // didn't qualify as a merge above) — never insert a second row with the same unique domain.
    let domain = s.domain;
    if (domain) {
      const [domainClash] = await deps.service.select().from(competitor).where(eq(competitor.domain, domain)).limit(1);
      if (domainClash) domain = null;
    }
    const inserted = await deps.service
      .insert(competitor)
      .values({ name: s.name, domain, placeId: s.placeId, cid: s.cid })
      .onConflictDoNothing()
      .returning({ id: competitor.id });
    if (inserted[0]) {
      competitorId = inserted[0].id;
    } else {
      // Lost a race to a concurrent accept of the same place/cid — resolve to whichever row won
      // instead of throwing a raw unique-violation.
      const winner = await findExistingCompetitor(deps.service, { placeId: s.placeId, cid: s.cid, domain: null });
      if (!winner) throw new Error('Could not create competitor');
      competitorId = winner.id;
    }
  }

  await withTenant(deps.app, ctx, async (tx) => {
    await tx.insert(clientCompetitor).values({ agencyId: s.agencyId, clientId: s.clientId, competitorId }).onConflictDoNothing();
    await tx.update(competitorSuggestion).set({ status: 'accepted' }).where(eq(competitorSuggestion.id, s.id));
  });
  await ensureCompetitorSources(deps.service, competitorId);
  return { competitorId };
}
