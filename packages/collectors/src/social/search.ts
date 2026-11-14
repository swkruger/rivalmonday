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

export interface Rejected {
  facebook: Set<string>;
  instagram: Set<string>;
  facebookIds: Set<string>;
}
const NO_REJECTED: Rejected = { facebook: new Set(), instagram: new Set(), facebookIds: new Set() };
const fbHandle = (r: ScCompany): string => (r.page_alias || r.page_id).toLowerCase();

const tokens = (name: string): string[] => normaliseName(name).split(' ').filter(Boolean);
/** Equal token lists, or one a prefix of the other where the shorter has >= 2 tokens or >= 10 characters joined. */
function namesMatch(a: string[], b: string[]): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 0) return false;
  if (!short.every((t, i) => long[i] === t)) return false;
  return short.length === long.length || short.length >= 2 || short.join(' ').length >= 10;
}

/** Stored Meta page id (live) wins; else the first live result whose name matches. Results whose handles were rejected are skipped. */
export function pickCandidate(results: ScCompany[], competitor: SocialCompetitor, rejected: Rejected = NO_REJECTED): ScCompany | null {
  const usable = results.filter(
    (r) =>
      r.page_is_deleted !== true &&
      !rejected.facebook.has(fbHandle(r)) &&
      !(r.ig_username && rejected.instagram.has(r.ig_username.toLowerCase())),
  );
  const known = new Set(competitor.metaPageIds);
  const byMeta = usable.find((r) => known.has(r.page_id));
  if (byMeta) return byMeta;
  const mine = tokens(competitor.name);
  return usable.find((r) => r.name !== null && namesMatch(mine, tokens(r.name))) ?? null;
}

const NOT_HANDLES = new Set(['p', 'reel', 'explore', 'accounts']);

const instagramHandle = (c: ScCompany, fb: ScFbProfile | null): string | null => {
  if (c.ig_username) return c.ig_username.toLowerCase();
  for (const l of fb?.links ?? []) {
    const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(l);
    if (m?.[1] && !NOT_HANDLES.has(m[1].toLowerCase())) return m[1].toLowerCase();
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

const isUniqueViolation = (e: unknown): boolean => {
  const code = (e as { code?: string; cause?: { code?: string } } | null);
  return code?.code === '23505' || code?.cause?.code === '23505';
};

/** Writes one candidate: skips rejected handles (any case, or the same FB profile id), never downgrades confirmed, demotes to suggested when the network already has another confirmed account. A unique-violation race falls back to suggested, then to a no-op. */
async function upsertAccount(db: Db, competitorId: string, c: Candidate, allowConfirm = true): Promise<AccountRow | undefined> {
  const handle = c.handle.toLowerCase();
  const all = await db
    .select()
    .from(socialAccount)
    .where(and(eq(socialAccount.competitorId, competitorId), eq(socialAccount.network, c.network)));
  const isMine = (r: AccountRow) => r.handle.toLowerCase() === handle || (c.externalId !== null && r.externalId === c.externalId);
  if (all.some((r) => r.status === 'rejected' && isMine(r))) return undefined;
  const existing = all.find((r) => r.handle.toLowerCase() === handle) ?? all.find(isMine);
  let status: Status = c.status;
  if (existing?.status === 'confirmed') status = 'confirmed';
  else if (status === 'confirmed' && (!allowConfirm || all.some((r) => r.status === 'confirmed'))) status = 'suggested';
  try {
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
        handle,
        externalId: c.externalId,
        url: c.url,
        status,
        confirmedBy: status === 'confirmed' ? 'website' : null,
        gated: c.gated,
      })
      .returning();
    return row;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Raced another run or an agency confirm: retry once as suggested, else leave what is there.
    return status === 'confirmed' && allowConfirm ? upsertAccount(db, competitorId, c, false) : undefined;
  }
}

/** Search (1 credit) -> pick -> Facebook profile (1; gated retry only when private) -> upsert Facebook + Instagram rows. IG inherits the Facebook status (same search row). */
export async function discoverSocialAccounts(
  db: Db,
  sc: ScClient,
  competitor: SocialCompetitor,
): Promise<{ facebook?: AccountRow; instagram?: AccountRow; credits: number }> {
  // Budget: search 1 + profile 1 = 2 credits; 3 only when the gated retry runs.
  let credits = 1;
  const stored = await db.select().from(socialAccount).where(and(eq(socialAccount.competitorId, competitor.id), eq(socialAccount.status, 'rejected')));
  const rejected: Rejected = { facebook: new Set(), instagram: new Set(), facebookIds: new Set() };
  for (const r of stored) {
    (r.network === 'facebook' ? rejected.facebook : rejected.instagram).add(r.handle.toLowerCase());
    if (r.network === 'facebook' && r.externalId) rejected.facebookIds.add(r.externalId);
  }
  const pick = pickCandidate(await sc.searchCompanies(competitor.name), competitor, rejected);
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
    handle: fbHandle(pick),
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
      status: pick.ig_username && status === 'confirmed' && out.facebook?.status === 'confirmed' ? 'confirmed' : 'suggested',
      gated: false,
    });
  }
  return out;
}
