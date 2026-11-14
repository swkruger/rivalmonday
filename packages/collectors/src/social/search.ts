import { type Db, socialAccount } from '@cs/db';
import { and, eq } from 'drizzle-orm';
import { normaliseName } from '../rivals/names';
import type { ScClient, ScCompany, ScFbProfile } from './client';
import { confirmsDomain } from './host';

export type AccountRow = typeof socialAccount.$inferSelect;
export interface SocialCompetitor {
  id: string;
  name: string;
  domain: string | null;
  metaPageIds: string[];
}

/** P1: a stored Meta page id wins; else the first live result whose normalised name starts like the competitor's. */
export function pickCandidate(results: ScCompany[], competitor: SocialCompetitor): ScCompany | null {
  const known = new Set(competitor.metaPageIds);
  const byMeta = results.find((r) => known.has(r.page_id));
  if (byMeta) return byMeta;
  const prefix = normaliseName(competitor.name).slice(0, 10);
  if (!prefix) return null;
  return results.find((r) => r.page_is_deleted !== true && r.name !== null && normaliseName(r.name).startsWith(prefix)) ?? null;
}

const NOT_HANDLES = new Set(['p', 'reel', 'explore', 'accounts']);

const instagramHandle = (c: ScCompany, fb: ScFbProfile | null): string | null => {
  if (c.ig_username) return c.ig_username;
  for (const l of fb?.links ?? []) {
    const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(l);
    if (m?.[1] && !NOT_HANDLES.has(m[1].toLowerCase())) return m[1];
  }
  return null;
};

type Status = 'confirmed' | 'suggested';
interface Candidate {
  network: 'facebook' | 'instagram';
  handle: string;
  url: string;
  externalId: string | null;
  status: Status;
  gated: boolean;
}

/** Writes one candidate: skips rejected handles, never downgrades confirmed, demotes to suggested when the network already has another confirmed account. */
async function upsertAccount(db: Db, competitorId: string, c: Candidate): Promise<AccountRow | undefined> {
  const [existing] = await db
    .select()
    .from(socialAccount)
    .where(and(eq(socialAccount.competitorId, competitorId), eq(socialAccount.network, c.network), eq(socialAccount.handle, c.handle)));
  if (existing?.status === 'rejected') return undefined;
  let status: Status = c.status;
  if (existing?.status === 'confirmed') status = 'confirmed';
  else if (status === 'confirmed') {
    const others = await db
      .select({ id: socialAccount.id })
      .from(socialAccount)
      .where(and(eq(socialAccount.competitorId, competitorId), eq(socialAccount.network, c.network), eq(socialAccount.status, 'confirmed')));
    if (others.length > 0) status = 'suggested';
  }
  if (existing) {
    const base = { url: c.url, externalId: c.externalId ?? existing.externalId, gated: c.gated, updatedAt: new Date() };
    const [row] = await db
      .update(socialAccount)
      .set(existing.status === 'confirmed' ? base : { ...base, status, confirmedBy: status === 'confirmed' ? 'website' : null })
      .where(eq(socialAccount.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(socialAccount)
    .values({
      competitorId,
      network: c.network,
      handle: c.handle,
      externalId: c.externalId,
      url: c.url,
      status,
      confirmedBy: status === 'confirmed' ? 'website' : null,
      gated: c.gated,
    })
    .returning();
  return row;
}

/** Search (1 credit) -> pick -> Facebook profile (1; gated retry only when private) -> upsert Facebook + Instagram rows. IG inherits the Facebook status (same search row). */
export async function discoverSocialAccounts(
  db: Db,
  sc: ScClient,
  competitor: SocialCompetitor,
): Promise<{ facebook?: AccountRow; instagram?: AccountRow; credits: number }> {
  let credits = 1;
  const pick = pickCandidate(await sc.searchCompanies(competitor.name), competitor);
  if (!pick) return { credits };

  const pageUrl = pick.page_alias ? `https://www.facebook.com/${pick.page_alias}` : `https://www.facebook.com/profile.php?id=${pick.page_id}`;
  credits += 1;
  let profile = await sc.facebookProfile(pageUrl);
  let gated = false;
  if ('private' in profile) {
    credits += 1;
    gated = true;
    profile = await sc.facebookProfile(pageUrl, { gated: true });
  }
  const fb = 'private' in profile ? null : profile;

  const matched = fb !== null && confirmsDomain(fb.website, competitor.domain);
  if (!matched && fb && competitor.metaPageIds.includes(pick.page_id)) {
    console.warn('social: meta page website mismatch', { competitorId: competitor.id, pageId: pick.page_id });
  }
  const status: Status = matched ? 'confirmed' : 'suggested';

  const out: { facebook?: AccountRow; instagram?: AccountRow; credits: number } = { credits };
  out.facebook = await upsertAccount(db, competitor.id, {
    network: 'facebook',
    handle: pick.page_alias || pick.page_id,
    url: pageUrl,
    externalId: fb?.id ?? null,
    status,
    gated,
  });

  const ig = instagramHandle(pick, fb);
  if (ig) {
    out.instagram = await upsertAccount(db, competitor.id, {
      network: 'instagram',
      handle: ig,
      url: `https://www.instagram.com/${ig}/`,
      externalId: null,
      // Same search row => same owner (P1); a handle found only in FB links is never auto-confirmed.
      status: pick.ig_username ? status : 'suggested',
      gated: false,
    });
  }
  return out;
}
