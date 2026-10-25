import { createHash } from 'node:crypto';
import { ad, capture, changeEvent, competitor, type Db, detectedChange, eventChange, eventScore, evidence, review, type ScoreFactors } from '@cs/db';
import { eq, sql } from 'drizzle-orm';
import { IDS, type IsolationWorld, type TenantKey, worldId } from '@cs/db/test-helpers';
import { detUuid } from '../briefs/cases';
import type { AskSeed } from './cases';

/**
 * A case's seeds over the isolation world (own drizzle inserts: `@cs/tools/test-fixtures` registers vitest hooks and
 * cannot load in the CLI). Ids are deterministic per (case, seed), so tool results and cassettes are stable.
 *
 * - `event`, client tenant (A1/A2/B1): a client-specific event (client/agency set) + its `event_score`; no captures, so
 *   no public evidence of the shared competitor ever carries another client's text.
 * - `event`, competitor tenant (X/Y/Z): a public web change (before/after capture on the competitor's world page, text
 *   evidence of the after capture) + event + one `event_score` per client tracking the competitor.
 * - `review` / `ad` / `page`: competitor-level rows (tenant must equal the competitor). Ads get a `vendor_json`
 *   evidence capture; a page is a public web change whose after capture (evidence + diff) holds the text, under a
 *   neutral "<name> updated a page on its website" summary.
 *
 * Every seed in a tenant forbidden to the A1 thread gets a ` CANARY-<tenant>-9nn` phrase appended (B1 checks it).
 * Competitor X (allowed to A1) is renamed to plain "Smith HVAC": with the world's canary suffix in its name,
 * `redactForModel` does not know "Smith HVAC" as a business and turns "Smith" in every seed text into "[name]".
 */
export const A1_ALLOWED: ReadonlySet<TenantKey> = new Set<TenantKey>(['A', 'A1', 'X']);
export const A1_FORBIDDEN: readonly TenantKey[] = ['A2', 'B', 'B1', 'Y', 'Z'];

export interface SeededCase {
  /** Evidence object key -> text (merge into the world's memory evidence store). */
  evidenceText: Map<string, string>;
  /** Canary phrases appended to forbidden seeds. */
  forbiddenCanaries: string[];
  /** Ids of every row seeded in a forbidden tenant. */
  forbiddenIds: string[];
}

const DAY = 86_400_000;
const FACTORS: ScoreFactors = {
  typeWeight: 1, size: 0.95, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 0.9, maxSimilarity: 0.1, needsReviewCap: false,
  thresholds: { alert: 70, brief: 40 }, scoringVersion: 1,
} as ScoreFactors;
const COMPETITOR: Record<AskSeed['competitor'], { name: string; id: (w: IsolationWorld) => string; vertical: string; service: string }> = {
  X: { name: 'Smith HVAC', id: () => IDS.competitorX, vertical: 'hvac_plumbing', service: 'ac_tune_up' },
  Y: { name: 'Bright Smiles', id: () => IDS.competitorY, vertical: 'dental', service: 'teeth_cleaning' },
  Z: { name: 'Zenith Heating', id: (w) => w.ids.competitorZ, vertical: 'hvac_plumbing', service: 'ac_tune_up' },
};
/** Clients tracking each competitor in the world (agency, client). */
const TRACKERS: Record<AskSeed['competitor'], [string, string][]> = {
  X: [[IDS.agencyA, IDS.clientA1], [IDS.agencyB, IDS.clientB1]],
  Y: [[IDS.agencyA, IDS.clientA2]],
  Z: [[IDS.agencyB, IDS.clientB1]],
};
const CLIENT_TENANT: Partial<Record<TenantKey, [string, string]>> = {
  A1: [IDS.agencyA, IDS.clientA1], A2: [IDS.agencyA, IDS.clientA2], B1: [IDS.agencyB, IDS.clientB1],
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function seedAskCase(owner: Db, w: IsolationWorld, caseId: string, seeds: AskSeed[], now: Date = new Date()): Promise<SeededCase> {
  const out: SeededCase = { evidenceText: new Map(), forbiddenCanaries: [], forbiddenIds: [] };
  await owner.update(competitor).set({ name: 'Smith HVAC' }).where(eq(competitor.id, IDS.competitorX));
  const day0 = Math.floor(now.getTime() / DAY) * DAY;
  const perTenant = new Map<TenantKey, number>();
  for (const [i, s] of seeds.entries()) {
    const forbidden = !A1_ALLOWED.has(s.tenant);
    let text = s.text;
    if (forbidden) {
      const n = (perTenant.get(s.tenant) ?? 0) + 1;
      perTenant.set(s.tenant, n);
      const canary = `CANARY-${s.tenant}-${900 + n}`;
      text = `${text} ${canary}`;
      out.forbiddenCanaries.push(canary);
    }
    const id = (what: string) => {
      const v = detUuid(`ask:${caseId}:${i}:${what}`);
      if (forbidden) out.forbiddenIds.push(v);
      return v;
    };
    const comp = COMPETITOR[s.competitor];
    const competitorId = comp.id(w);
    const at = new Date(day0 - s.ageDays * DAY + 10 * 3_600_000);
    const pageId = worldId('tracked_page', s.competitor, 1);
    const pageUrl = `https://${s.competitor.toLowerCase()}.world.example/page`;

    /** One capture (+ evidence of `kind` holding `text` when given). */
    const shot = async (source: string, when: Date, kind: 'text' | 'vendor_json' | null, tag: string): Promise<{ captureId: string; evidenceId: string | null }> => {
      const captureId = id(`capture-${tag}`);
      await owner.insert(capture).values({
        id: captureId, competitorId, trackedPageId: source === 'web' ? pageId : null, source, url: source === 'web' ? pageUrl : null, status: 'ok', collectorVersion: 'ask-eval', capturedAt: when,
      });
      if (!kind) return { captureId, evidenceId: null };
      const evidenceId = id(`evidence-${tag}`);
      const objectKey = `ask/${caseId}/${evidenceId}.${kind === 'text' ? 'txt' : 'json'}`;
      const body = kind === 'text' ? text : JSON.stringify({ text });
      out.evidenceText.set(objectKey, body);
      await owner.insert(evidence).values({
        id: evidenceId, captureId, kind, objectKey, sha256: sha(body), bytes: Buffer.byteLength(body), contentType: kind === 'text' ? 'text/plain' : 'application/json',
      });
      return { captureId, evidenceId };
    };

    /** A public web change on the competitor's world page: `pageText` is the after capture's evidence and diff text. */
    const publicChange = async (summary: string, pageText: string) => {
      if (s.tenant !== s.competitor) throw new Error(`${caseId} seed ${i}: a public ${s.kind}'s tenant must be its competitor`);
      const before = await shot('web', new Date(at.getTime() - DAY), null, 'before');
      const after = await shot('web', at, 'text', 'after');
      const changeId = id('change');
      const eventId = id('event');
      await owner.insert(detectedChange).values({
        id: changeId, competitorId, trackedPageId: pageId, source: 'web', kind: 'modified', beforeCaptureId: before.captureId, afterCaptureId: after.captureId,
        blockKey: `ask-${i}`, beforeText: 'previous page text', afterText: pageText, status: 'event', stageVersion: 1, detectedAt: at,
      });
      await owner.insert(changeEvent).values({
        id: eventId, competitorId, changeType: 'content', channels: ['web'], services: { [comp.vertical]: comp.service }, summary, confidence: 0.9, occurredAt: at,
      });
      await owner.insert(eventChange).values({ eventId, changeId });
      for (const [agencyId, clientId] of TRACKERS[s.competitor]) {
        await owner.insert(eventScore).values({ agencyId, clientId, eventId, score: 75, route: 'alert', factors: FACTORS, packVersion: 1, scoredAt: at });
      }
    };

    switch (s.kind) {
      case 'event': {
        const client = CLIENT_TENANT[s.tenant];
        if (!client) {
          await publicChange(text, text);
          break;
        }
        const [agencyId, clientId] = client;
        const eventId = id('event');
        await owner.insert(changeEvent).values({
          id: eventId, competitorId, agencyId, clientId, changeType: 'content', channels: ['web'], services: { [comp.vertical]: comp.service }, summary: text, confidence: 0.9, occurredAt: at,
        });
        await owner.insert(eventScore).values({ agencyId, clientId, eventId, score: 75, route: 'alert', factors: FACTORS, packVersion: 1, scoredAt: at });
        break;
      }
      case 'review': {
        if (s.tenant !== s.competitor) throw new Error(`${caseId} seed ${i}: a review's tenant must be its competitor`);
        await owner.insert(review).values({
          id: id('review'), competitorId, dedupeKey: `ask-${caseId}-${i}`, rating: 4, text, reviewerHash: `ask-reviewer-${i}`, postedAt: at, firstSeenAt: at, lastSeenAt: at,
        });
        break;
      }
      case 'ad': {
        if (s.tenant !== s.competitor) throw new Error(`${caseId} seed ${i}: an ad's tenant must be its competitor`);
        const cap = await shot('google_ads', at, 'vendor_json', 'ad');
        await owner.insert(ad).values({
          id: id('ad'), competitorId, platform: 'google', externalId: `ask-${caseId}-${i}`, title: text.split(/[.:]/)[0]!.slice(0, 80), text, startedAt: at, isActive: true,
          firstSeenAt: at, lastSeenAt: at, firstCaptureId: cap.captureId, lastCaptureId: cap.captureId,
        });
        break;
      }
      case 'page': {
        // The page text is what a change captured (diff + evidence); the change's own summary stays neutral.
        await publicChange(`${comp.name} updated a page on its website`, text);
        break;
      }
    }
  }
  return out;
}

/** Tables whose rows may never be updated (evidence immutability trigger, migration 0013). */
const IMMUTABLE = new Set(['capture', 'evidence']);

/** The DB clock (ms) right now; pair with `Date.now()` (pinned) to measure the real-vs-pinned offset. */
export async function dbClockMs(owner: Db): Promise<number> {
  const [row] = (await owner.execute(sql`SELECT (extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms`)) as unknown as { ms: number }[];
  return Number(row!.ms);
}

/**
 * R14 (revised): the JS clock is pinned, but column defaults (`now()`, e.g. `client_competitor.created_at`,
 * `ad.first_seen_at`) stamp the DB's real clock, and tools return them (`list_client_competitors` `date`,
 * `get_competitor_profile` `addedAt`, `list_ads`), so the cassette key would move with the real day. Every public
 * timestamp column whose value the DB stamped during seeding ([fromMs, toMs] on the DB clock) is moved by `offsetMs`
 * (DB clock minus pinned clock) onto the pinned clock. Capture/evidence rows are immutable and skipped.
 */
export async function shiftDbStamps(owner: Db, fromMs: number, toMs: number, offsetMs: number): Promise<number> {
  const cols = (await owner.execute(sql`
    SELECT c.table_name AS t, array_agg(c.column_name::text ORDER BY c.column_name) AS cols
    FROM information_schema.columns c JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE' AND c.data_type IN ('timestamp with time zone', 'timestamp without time zone')
    GROUP BY c.table_name`)) as unknown as { t: string; cols: string[] }[];
  const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
  const lo = `to_timestamp(${(fromMs - 1000) / 1000})`;
  const hi = `to_timestamp(${(toMs + 1000) / 1000})`;
  const by = `make_interval(secs => ${offsetMs / 1000})`;
  let n = 0;
  for (const { t, cols: cs } of cols) {
    if (IMMUTABLE.has(t)) continue;
    const hit = (c: string) => `${q(c)}::timestamptz BETWEEN ${lo} AND ${hi}`;
    const set = cs.map((c) => `${q(c)} = CASE WHEN ${hit(c)} THEN ${q(c)} - ${by} ELSE ${q(c)} END`).join(', ');
    const res = (await owner.execute(sql.raw(`UPDATE ${q(t)} SET ${set} WHERE ${cs.map(hit).join(' OR ')}`))) as unknown as { count?: number };
    n += res.count ?? 0;
  }
  return n;
}
