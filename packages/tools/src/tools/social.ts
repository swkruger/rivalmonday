import { canAccessClient, SPEND_PAUSED_COPY, toolkit, ToolError } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { socialCaptureUrl, socialProfileKey } from '@cs/collectors';
import { agencyServiceable, auditLog, capture, client, clientCompetitor, clientWorkAllowed, evidence, observation, type SocialNetwork, socialAccount, withTenant } from '@cs/db';
import { isOfferPost, socialPostsOfConfirmedAccounts } from '@cs/engine';
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf } from '../catalog/access';
import { enqueueOf, type ToolDeps } from '../deps';
import { citableEvidenceKinds } from '../workspace/events-read';
import { forChannel } from '../workspace/model-text';
import { trackedRows, workspaceBusinesses } from '../workspace/business';
import { allInOrder, workspaceClient } from '../workspace/scope';
import { SocialAccountsView, SocialActivityView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const CHANGE_DAYS = 90;
/** "Find accounts" may run once per business per agency in this many days (audit rows of the tool, like "Test webhook"). */
export const SOCIAL_FIND_DAYS = 7;
const PROFILE_KIND = 'social_profile';
const uuid = z.string().uuid();

/** (draft → copy review) */
const ACCOUNT_URL_COPY = 'That link is not a Facebook page or Instagram profile. Paste the page link itself, like facebook.com/yourrival or instagram.com/yourrival (not a post, group or section).';


/** The latest follower count per profile key, and the latest one at least 90 days old (the base of the change). */
async function followerReadings(db: ToolDeps['service'], competitorIds: string[], now: Date): Promise<Map<string, { latest: number | null; base: number | null }>> {
  const out = new Map<string, { latest: number | null; base: number | null }>();
  if (competitorIds.length === 0) return out;
  const cutoff = now.getTime() - CHANGE_DAYS * DAY_MS;
  const rows = await db.select({ competitorId: observation.competitorId, key: observation.key, data: observation.data, observedAt: observation.observedAt })
    .from(observation).where(and(inArray(observation.competitorId, competitorIds), eq(observation.kind, PROFILE_KIND)))
    .orderBy(desc(observation.observedAt), desc(observation.id));
  for (const r of rows) {
    const id = `${r.competitorId}|${r.key}`;
    const followers = typeof r.data.followers === 'number' ? r.data.followers : null;
    const cur = out.get(id) ?? { latest: null, base: null };
    if (cur.latest === null && followers !== null) cur.latest = followers;
    if (cur.base === null && followers !== null && r.observedAt.getTime() <= cutoff) cur.base = followers;
    out.set(id, cur);
  }
  return out;
}

export const getSocialActivity = defineTool({
  name: 'get_social_activity',
  access: 'read',
  description: "The client's and its tracked rivals' confirmed Facebook and Instagram accounts: followers, the follower change over 90 days, posts in the last 30 days, the latest post date within those 30 days and any offers posted in the last 30 days. "
    + 'Only accounts confirmed as the business\'s own appear; a business with none is listed with no accounts. Each account\'s and offer\'s evidenceId is the evidence to cite for it.',
  input: z.object({ clientId: uuid }),
  output: SocialActivityView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, input, deps, meta) {
    const now = new Date();
    const [c, tracked] = await allInOrder([
      workspaceClient(deps, ctx, input.clientId),
      withTenant(deps.app, ctx, (tx) => trackedRows(tx, input.clientId)),
    ]);
    const list = (await workspaceBusinesses(deps, ctx, c, tracked)).filter((b) => b.competitorId !== null);
    const ids = list.map((b) => b.competitorId!);
    const names = list.map((b) => b.name);
    const accounts = ids.length
      ? await deps.service.select().from(socialAccount).where(and(inArray(socialAccount.competitorId, ids), eq(socialAccount.status, 'confirmed'))).orderBy(asc(socialAccount.network), asc(socialAccount.handle))
      : [];
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    // Confirmed accounts' posts only (`socialPostsOfConfirmedAccounts`); a lastPostAt older than 30 days is not shown, so the account reads "no recent post".
    const [posts, readings] = await Promise.all([socialPostsOfConfirmedAccounts(deps.service, ids, since), followerReadings(deps.service, ids, now)]);
    // Newest citable evidence of each confirmed account's own capture (never another account's), and of the capture that first saw each offer.
    const urls = accounts.map((a) => socialCaptureUrl(a));
    const offerPosts = posts.filter((p) => isOfferPost(p.text));
    const kinds = citableEvidenceKinds(meta);
    const [byUrl, byCapture] = await Promise.all([
      urls.length
        ? deps.service.selectDistinctOn([capture.competitorId, capture.url], { competitorId: capture.competitorId, url: capture.url, id: evidence.id }).from(evidence)
          .innerJoin(capture, eq(capture.id, evidence.captureId))
          .where(and(inArray(capture.competitorId, ids), inArray(capture.url, urls), eq(capture.source, 'social'), eq(capture.status, 'ok'), inArray(evidence.kind, kinds)))
          .orderBy(capture.competitorId, capture.url, desc(capture.capturedAt), asc(evidence.kind), asc(evidence.id))
        : Promise.resolve([]),
      offerPosts.length
        ? deps.service.select({ captureId: evidence.captureId, id: evidence.id }).from(evidence)
          .where(and(inArray(evidence.captureId, [...new Set(offerPosts.map((p) => p.firstCaptureId))]), inArray(evidence.kind, kinds))).orderBy(asc(evidence.kind), asc(evidence.id))
        : Promise.resolve([]),
    ]);
    const evidenceOfAccount = (competitorId: string, url: string) => byUrl.find((e) => e.competitorId === competitorId && e.url === url)?.id ?? null;
    return {
      businesses: list.map((b) => {
        const own = accounts.filter((a) => a.competitorId === b.competitorId);
        const ownPosts = posts.filter((p) => p.competitorId === b.competitorId);
        return {
          competitorId: b.competitorId!,
          name: forChannel(meta, b.name, names),
          self: b.self,
          accounts: own.map((a) => {
            const r = readings.get(`${a.competitorId}|${socialProfileKey(a)}`);
            const mine = ownPosts.filter((p) => p.accountId === a.id);
            const last = mine.reduce<Date | null>((m, p) => (m === null || p.postedAt > m ? p.postedAt : m), null);
            return {
              network: a.network, handle: a.handle, url: a.url,
              followers: r?.latest ?? null,
              followers90dChange: r && r.latest !== null && r.base !== null ? r.latest - r.base : null,
              posts30d: mine.length, lastPostAt: last?.toISOString() ?? null,
              evidenceId: evidenceOfAccount(a.competitorId, socialCaptureUrl(a)),
            };
          }),
          offers: ownPosts.filter((p) => isOfferPost(p.text)).sort((x, y) => y.postedAt.getTime() - x.postedAt.getTime() || x.id.localeCompare(y.id)).map((p) => ({
            network: p.network, postedAt: p.postedAt.toISOString(), text: forChannel(meta, p.text, names), url: p.url,
            evidenceId: byCapture.find((e) => e.captureId === p.firstCaptureId)?.id ?? null,
          })),
        };
      }),
    };
  },
});

/** A competitor the caller may act on: one of the caller's accessible clients (own agency, not archived) tracks it or it is that client's own business. Anything else is `not_found`. */
async function requireVisibleCompetitor(deps: ToolDeps, ctx: Parameters<typeof canAccessClient>[0] & { agencyId: string }, competitorId: string): Promise<{ id: string; verticalId: string; workAllowed: boolean }[]> {
  const rows = await deps.service.select({ id: client.id, verticalId: client.verticalId, workAllowed: sql<boolean>`${clientWorkAllowed(client)} AND ${agencyServiceable(client.agencyId)}` }).from(client)
    .leftJoin(clientCompetitor, and(eq(clientCompetitor.clientId, client.id), eq(clientCompetitor.competitorId, competitorId)))
    .where(and(eq(client.agencyId, ctx.agencyId), isNull(client.archivedAt), or(eq(client.selfCompetitorId, competitorId), eq(clientCompetitor.competitorId, competitorId))));
  const visible = rows.filter((r) => canAccessClient(ctx, r.id));
  if (visible.length === 0) throw new ToolError('not_found', 'Business not found');
  return visible;
}

const refuseInput = (message: string) => new ToolError('invalid_input', message, { userFacing: true });

const FB_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com']);
const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const HANDLE = /^[a-z0-9._-]{1,80}$/;
/** First path segments that are site sections or content, never an account (case-insensitive). */
const FB_RESERVED = new Set(['groups', 'pages', 'watch', 'events', 'marketplace', 'gaming', 'home.php', 'login', 'sharer', 'share', 'story.php', 'permalink.php', 'photo', 'photos', 'videos', 'hashtag', 'people']);
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts', 'direct', 'about', 'legal']);

export interface ParsedAccountUrl { network: SocialNetwork; handle: string; externalId: string | null; url: string }

/** `facebook.com/<alias>`, `facebook.com/profile.php?id=<id>` or `instagram.com/<handle>`; anything else (posts, groups, other sites) is refused. */
export function parseSocialUrl(raw: string): ParsedAccountUrl {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw refuseInput(ACCOUNT_URL_COPY);
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  if (FB_HOSTS.has(host)) {
    if (parts.length === 1 && parts[0]!.toLowerCase() === 'profile.php') {
      const id = u.searchParams.get('id') ?? '';
      if (!/^\d{5,20}$/.test(id)) throw refuseInput(ACCOUNT_URL_COPY);
      return { network: 'facebook', handle: id, externalId: id, url: `https://www.facebook.com/profile.php?id=${id}` };
    }
    const alias = (parts[0] ?? '').toLowerCase();
    if (parts.length !== 1 || !HANDLE.test(alias) || alias === 'profile.php' || FB_RESERVED.has(alias)) throw refuseInput(ACCOUNT_URL_COPY);
    return { network: 'facebook', handle: alias, externalId: null, url: `https://www.facebook.com/${parts[0]}` };
  }
  if (IG_HOSTS.has(host)) {
    const handle = (parts[0] ?? '').toLowerCase();
    if (parts.length !== 1 || !/^[a-z0-9._]{1,30}$/.test(handle) || IG_RESERVED.has(handle)) throw refuseInput(ACCOUNT_URL_COPY);
    return { network: 'instagram', handle, externalId: null, url: `https://www.instagram.com/${parts[0]}` };
  }
  throw refuseInput(ACCOUNT_URL_COPY);
}

export const listSocialAccounts = defineTool({
  name: 'list_social_accounts',
  access: 'read',
  description: 'Every Facebook and Instagram account found for a business the agency tracks, confirmed, suggested and rejected, with its status, who confirmed it, followers and when it was last pulled. Agency roles only.',
  input: z.object({ competitorId: uuid }),
  output: SocialAccountsView,
  permission: 'agency',
  async handler(ctx, { competitorId }, deps) {
    await requireVisibleCompetitor(deps, ctx, competitorId);
    const rows = await deps.service.select().from(socialAccount).where(eq(socialAccount.competitorId, competitorId)).orderBy(asc(socialAccount.network), asc(socialAccount.handle));
    const readings = await followerReadings(deps.service, [competitorId], new Date());
    return {
      accounts: rows.map((a) => ({
        id: a.id, network: a.network, handle: a.handle, url: a.url, status: a.status, confirmedBy: a.confirmedBy,
        followers: readings.get(`${competitorId}|${socialProfileKey(a)}`)?.latest ?? null, lastPulledAt: a.lastPulledAt?.toISOString() ?? null,
      })),
    };
  },
});

export const confirmSocialAccount = defineTool({
  name: 'confirm_social_account',
  access: 'write',
  description: "Confirm or reject a Facebook or Instagram account for a business the agency tracks, by account id or by pasting its link. Confirming replaces any account already confirmed for that network. Agency roles only.",
  input: z.object({ competitorId: uuid, accountId: uuid.optional(), url: z.string().min(1).max(500).optional(), decision: z.enum(['confirm', 'reject']) })
    .refine((i) => (i.accountId === undefined) !== (i.url === undefined), { message: 'Give either an account or a link, not both.' }),
  output: z.object({ accountId: uuid, status: z.enum(['confirmed', 'rejected']) }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    await requireVisibleCompetitor(deps, ctx, input.competitorId);
    const parsed = input.url ? parseSocialUrl(input.url) : null;
    const competitorId = input.competitorId;
    return deps.service.transaction(async (tx) => {
      const find = async () => {
        if (input.accountId) return (await tx.select().from(socialAccount).where(and(eq(socialAccount.id, input.accountId), eq(socialAccount.competitorId, competitorId))))[0];
        const p = parsed!;
        return (await tx.select().from(socialAccount).where(and(
          eq(socialAccount.competitorId, competitorId), eq(socialAccount.network, p.network),
          p.externalId ? or(sql`lower(${socialAccount.handle}) = ${p.handle}`, eq(socialAccount.externalId, p.externalId)) : sql`lower(${socialAccount.handle}) = ${p.handle}`,
        )))[0];
      };
      const existing = await find();
      const now = new Date();
      if (input.decision === 'reject') {
        if (!existing) throw new ToolError('not_found', 'Account not found');
        await tx.update(socialAccount).set({ status: 'rejected', updatedAt: now }).where(eq(socialAccount.id, existing.id));
        return { accountId: existing.id, status: 'rejected' as const };
      }
      if (!existing && !parsed) throw new ToolError('not_found', 'Account not found');
      const network = existing?.network ?? parsed!.network;
      // The one-confirmed-per-network index: demote the current account first.
      await tx.update(socialAccount).set({ status: 'rejected', updatedAt: now })
        .where(and(eq(socialAccount.competitorId, competitorId), eq(socialAccount.network, network), eq(socialAccount.status, 'confirmed'), existing ? ne(socialAccount.id, existing.id) : undefined));
      const confirmed = { status: 'confirmed' as const, confirmedBy: 'agency' as const, confirmedByUser: ctx.userId, updatedAt: now };
      if (existing) {
        await tx.update(socialAccount).set({ ...confirmed, ...(parsed ? { url: parsed.url, externalId: parsed.externalId ?? existing.externalId } : {}) }).where(eq(socialAccount.id, existing.id));
        return { accountId: existing.id, status: 'confirmed' as const };
      }
      const p = parsed!;
      const [ins] = await tx.insert(socialAccount).values({ competitorId, network: p.network, handle: p.handle, externalId: p.externalId, url: p.url, ...confirmed }).returning({ id: socialAccount.id });
      return { accountId: ins!.id, status: 'confirmed' as const };
    });
  },
});

export const findSocialAccounts = defineTool({
  name: 'find_social_accounts',
  access: 'write',
  description: 'Search for the Facebook and Instagram accounts of a business the agency tracks, for the agency to confirm. Once per business per week. Agency roles only.',
  input: z.object({ competitorId: uuid }),
  output: z.object({ queued: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { competitorId }, deps) {
    const clients = await requireVisibleCompetitor(deps, ctx, competitorId);
    // Paid vendor searches: only for a business some client of the caller still has work allowed for, whose vertical watches social accounts.
    const load = packsOf(deps);
    const allowed = clients.filter((c) => c.workAllowed);
    const watched = (await Promise.all(allowed.map(async (c) => (await load(c.verticalId)).social === true))).some(Boolean);
    if (allowed.length === 0) throw new ToolError('spend_paused', SPEND_PAUSED_COPY, { userFacing: true });
    if (!watched) throw new ToolError('conflict', 'Facebook and Instagram are not watched for this type of business.', { userFacing: true });
    const enqueue = enqueueOf(deps);
    // Counted from the registry's audit rows (same agency, tool and input hash, ok, inside the window); refused calls never count.
    const [row] = await deps.service.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(and(
      eq(auditLog.agencyId, ctx.agencyId), eq(auditLog.tool, 'find_social_accounts'), eq(auditLog.inputHash, hashInput({ competitorId })), eq(auditLog.outcome, 'ok'),
      gt(auditLog.createdAt, new Date(Date.now() - SOCIAL_FIND_DAYS * DAY_MS)),
    ));
    if ((row?.n ?? 0) > 0) throw new ToolError('rate_limited', 'Accounts were searched for this business in the last 7 days. Try again later or paste the link instead.', { userFacing: true });
    await enqueue('social-discover', { competitorId }, `social-discover:${competitorId}`);
    return { queued: true as const };
  },
});

export const socialTools = [getSocialActivity, listSocialAccounts, confirmSocialAccount, findSocialAccounts];
