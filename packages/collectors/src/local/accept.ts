import type { AccessContext } from '@cs/core';
import { clientCompetitor, competitor, competitorSuggestion, type Db, withTenant } from '@cs/db';
import { eq } from 'drizzle-orm';
import { ensureCompetitorSources } from '../sources/ensure';

/** Visibility is checked through RLS as the caller; the global competitor is written by the service role. */
export async function acceptSuggestion(deps: { service: Db; app: Db }, ctx: AccessContext, suggestionId: string): Promise<{ competitorId: string }> {
  const [s] = await withTenant(deps.app, ctx, (tx) => tx.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, suggestionId)).limit(1));
  if (!s) throw new Error('Suggestion not found');

  let [existing] = s.placeId ? await deps.service.select().from(competitor).where(eq(competitor.placeId, s.placeId)).limit(1) : [];
  if (!existing && s.domain) [existing] = await deps.service.select().from(competitor).where(eq(competitor.domain, s.domain)).limit(1);
  const competitorId =
    existing?.id ??
    (await deps.service.insert(competitor).values({ name: s.name, domain: s.domain, placeId: s.placeId, cid: s.cid }).returning({ id: competitor.id }))[0]?.id;
  if (!competitorId) throw new Error('Could not create competitor');

  await withTenant(deps.app, ctx, async (tx) => {
    await tx.insert(clientCompetitor).values({ agencyId: s.agencyId, clientId: s.clientId, competitorId }).onConflictDoNothing();
    await tx.update(competitorSuggestion).set({ status: 'accepted' }).where(eq(competitorSuggestion.id, s.id));
  });
  await ensureCompetitorSources(deps.service, competitorId);
  return { competitorId };
}
