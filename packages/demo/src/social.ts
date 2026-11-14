import { socialCaptureUrl, socialProfileKey } from '@cs/collectors';
import { capture, observation, type SocialNetwork, socialAccount, socialPost } from '@cs/db';
import type { SeedContext } from './context';
import { putEvidence } from './evidence';
import { DEMO_COLLECTOR } from './tenancy';

interface DemoPost { id: string; agoDays: number; text: string }
interface DemoAccount { network: SocialNetwork; handle: string; followers: number; olderFollowers: number | null; posts: DemoPost[] }

/** Lone Star's first rival: a Facebook page with a recent offer post (confirmed from its website) and one Instagram handle still waiting for a yes or no. */
const FACEBOOK: DemoAccount = {
  network: 'facebook', handle: 'summitairdemo', followers: 1840, olderFollowers: 1710,
  posts: [
    { id: 'fb-1', agoDays: 2, text: 'Spring tune-up special: $79 until the end of the month. Call us to book.' },
    { id: 'fb-2', agoDays: 6, text: 'Our crew helped a family stay cool this weekend. Thank you for trusting us.' },
    { id: 'fb-3', agoDays: 13, text: 'Tip of the week: change your filter every 90 days.' },
    { id: 'fb-4', agoDays: 21, text: 'Meet Dan, 15 years with the team.' },
  ],
};
const SUGGESTED_INSTAGRAM = { network: 'instagram' as const, handle: 'summitair.demo' };
/** Lone Star's second rival: Instagram only, confirmed by the agency. */
const INSTAGRAM: DemoAccount = {
  network: 'instagram', handle: 'northgate.hvac.demo', followers: 620, olderFollowers: null,
  posts: [{ id: 'ig-1', agoDays: 4, text: 'New van, same friendly crew.' }, { id: 'ig-2', agoDays: 18, text: 'Before and after: a clean furnace install.' }],
};

/** 18e: confirmed Facebook / Instagram accounts with one capture, follower readings and posts each, plus one suggested account. */
export async function seedSocial(ctx: SeedContext): Promise<void> {
  const [first, second] = ctx.ids.competitors.loneStar;
  const accounts: [typeof first, DemoAccount, 'website' | 'agency'][] = [[first!, FACEBOOK, 'website']];
  if (second) accounts.push([second, INSTAGRAM, 'agency']);
  for (const [rival, a, by] of accounts) {
    const url = `https://www.${a.network}.com/${a.handle}`;
    const at = ctx.clock.daysAgo(1);
    const [acct] = await ctx.db.insert(socialAccount).values({ competitorId: rival!.id, network: a.network, handle: a.handle, url, status: 'confirmed', confirmedBy: by, lastPulledAt: at })
      .returning({ id: socialAccount.id, network: socialAccount.network });
    // One account identity, as the weekly pull writes it: observation key and payload `accountId` = `social_account.id`.
    const key = socialProfileKey(acct!);
    const [cap] = await ctx.db.insert(capture).values({
      competitorId: rival!.id, source: 'social', url: socialCaptureUrl(a), status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: at,
    }).returning({ id: capture.id });
    await putEvidence(ctx, {
      captureId: cap!.id, competitorId: rival!.id, kind: 'vendor_json', contentType: 'application/json',
      body: new TextEncoder().encode(JSON.stringify({ network: a.network, accountId: acct!.id, profile: { followers: a.followers }, posts: a.posts.map((p) => ({ id: p.id, text: p.text })) }, null, 2)),
    });
    await ctx.db.insert(observation).values({ competitorId: rival!.id, captureId: cap!.id, kind: 'social_profile', key, data: { network: a.network, accountId: acct!.id, followers: a.followers }, observedAt: at });
    if (a.olderFollowers !== null) {
      // An older reading (its own capture; one observation per capture and key) gives the 90-day follower change.
      const old = ctx.clock.daysAgo(100);
      const [oldCap] = await ctx.db.insert(capture).values({ competitorId: rival!.id, source: 'social', url: socialCaptureUrl(a), status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: old }).returning({ id: capture.id });
      await ctx.db.insert(observation).values({ competitorId: rival!.id, captureId: oldCap!.id, kind: 'social_profile', key, data: { network: a.network, accountId: acct!.id, followers: a.olderFollowers }, observedAt: old });
    }
    await ctx.db.insert(socialPost).values(a.posts.map((p) => ({
      competitorId: rival!.id, network: a.network, postId: `demo:${p.id}`, postedAt: ctx.clock.daysAgo(p.agoDays), text: p.text,
      url: `${url}/posts/${p.id}`, firstCaptureId: cap!.id, firstSeenAt: ctx.clock.daysAgo(p.agoDays - 1 > 0 ? p.agoDays - 1 : 0),
    })));
  }
  await ctx.db.insert(socialAccount).values({
    competitorId: first!.id, network: SUGGESTED_INSTAGRAM.network, handle: SUGGESTED_INSTAGRAM.handle, url: `https://www.instagram.com/${SUGGESTED_INSTAGRAM.handle}`, status: 'suggested',
  });
}
