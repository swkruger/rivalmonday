import { type Db, socialAccount } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { sql } from 'drizzle-orm';
import type { PackLoader } from '../rivals/run';
import { markSourceResult } from '../sources/due';
import type { ScClient } from './client';
import { pullSocial } from './pull';
import { discoverSocialAccounts, type SocialCompetitor } from './search';
import { deferSocialSource, SOCIAL_KIND, wantedSocialCompetitors } from './sources';

export interface SocialRunDeps {
  db: Db;
  store: ObjectStore;
  /** Null when SCRAPECREATORS_API_KEY is not set. */
  sc: ScClient | null;
  /** Test seams; default to the real discovery and pull. */
  discover?: typeof discoverSocialAccounts;
  pull?: typeof pullSocial;
}

/** First claim of the source: no account rows at all (any status) and the source has never run. */
async function isFirstRun(db: Db, competitorId: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT (NOT EXISTS (SELECT 1 FROM ${socialAccount} sa WHERE sa.competitor_id = ${competitorId})
            AND EXISTS (SELECT 1 FROM competitor_source cs WHERE cs.competitor_id = ${competitorId} AND cs.source = ${SOCIAL_KIND} AND cs.last_run_at IS NULL)) AS first`)) as unknown as { first: boolean }[];
  return rows[0]?.first === true;
}

/**
 * The weekly `social` pull. On the first run it discovers the accounts first, then pulls (so accounts confirmed now are pulled now).
 * Without a vendor key the source is deferred a day and `last_run_at` stays null. A discovery that fails after reaching the vendor marks
 * the source `error` (retry next week); one that fails before any vendor call (e.g. DB) rethrows for the queue's retry.
 */
export async function runSocialPull(deps: SocialRunDeps, c: SocialCompetitor): Promise<Record<string, unknown>> {
  const { db, sc } = deps;
  if (!sc) {
    await deferSocialSource(db, c.id, 'no_api_key');
    return { status: 'skipped', reason: 'no_api_key' };
  }
  let discovered: Record<string, unknown> | undefined;
  if (await isFirstRun(db, c.id)) {
    let calls = 0;
    const counted: ScClient = {
      searchCompanies: (q) => (calls++, sc.searchCompanies(q)),
      facebookProfile: (u, o) => (calls++, sc.facebookProfile(u, o)),
      facebookPosts: (id, cur) => (calls++, sc.facebookPosts(id, cur)),
      instagramProfile: (h) => (calls++, sc.instagramProfile(h)),
    };
    try {
      const r = await (deps.discover ?? discoverSocialAccounts)(db, counted, c);
      discovered = { credits: r.credits };
    } catch (err) {
      if (calls === 0) throw err;
      await markSourceResult(db, c.id, SOCIAL_KIND, 'error');
      return { status: 'error', stage: 'discover' };
    }
  }
  try {
    const r = await (deps.pull ?? pullSocial)({ db, store: deps.store, sc }, c.id);
    await markSourceResult(db, c.id, SOCIAL_KIND, 'ok');
    return { status: 'ok', captures: r.captures.length, credits: r.credits, discovered };
  } catch (err) {
    await markSourceResult(db, c.id, SOCIAL_KIND, 'error');
    throw err;
  }
}

/** Manual discovery (the tool path): skipped without the key or when no eligible client tracks the competitor (no paid call). */
export async function runSocialDiscover(deps: Pick<SocialRunDeps, 'db' | 'sc' | 'discover'> & { packs: PackLoader }, c: SocialCompetitor): Promise<Record<string, unknown>> {
  if (!deps.sc) return { status: 'skipped', reason: 'no_api_key' };
  if (!(await wantedSocialCompetitors(deps.db, deps.packs)).includes(c.id)) return { status: 'skipped', reason: 'no_eligible_client' };
  const r = await (deps.discover ?? discoverSocialAccounts)(deps.db, deps.sc, c);
  return { status: 'ok', credits: r.credits, facebook: r.facebook?.status ?? null, instagram: r.instagram?.status ?? null };
}
