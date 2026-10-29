import type { Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { sql } from 'drizzle-orm';
import { buildRenamer, DEMO_PLACES, DEMO_REAL_BUSINESS_WORDS, DEMO_ZIPS, type GuardHit, guard, type RenameSources, STATE_TERMS } from './rename';
import type { RivalTier, SampleBriefData, SampleEvidence } from './types';

type Item = SampleBriefData['items'][number];
type Week = SampleBriefData['rankGrid']['weeks'][number];

/** Items shown: the latest approved/sent brief's, topped up from the previous ones while fewer than MIN_ITEMS (demo briefs carry 2 each). */
const MIN_ITEMS = 4;
const MAX_ITEMS = 6;
const MAX_REVIEWS = 5;
const MAX_ADS = 3;
const WEEKS = 12;
const VERTICAL = 'Heating & air';
/** Known-real words that are not rename sources; the guard still denies them. */
const EXTRA_DENY = ['Brazos Digital', 'cs_demo'];
const TIERS: readonly RivalTier[] = ['top', 'watch', 'minor'];
const KINDS: readonly Item['kind'][] = ['website', 'reviews', 'ads', 'rank', 'listing'];
const PLATFORMS = ['google', 'meta'] as const;

const KIND_OF: Record<string, Item['kind']> = {
  price_change: 'website', promo: 'website', new_service: 'website', content: 'website',
  ad_started: 'ads', ad_stopped: 'ads', review_spike: 'reviews',
  rating_change: 'listing', service_area_change: 'listing', new_location: 'listing', hiring: 'listing',
  rank_change: 'rank', tier_change: 'rank',
};

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const iso = (d: Date | string) => new Date(d).toISOString();

async function rows<T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> {
  return [...(await db.execute(q))] as T[];
}

/**
 * Snapshot text: the stored `text` evidence (blocks joined by blank lines), else the capture's `capture_block` rows, else the
 * detected change's own text as one block (an older demo seed has no blocks, and a worktree has no evidence directory).
 */
async function pageTexts(db: Db, store: ObjectStore, captureId: string, changeText: string | null): Promise<string[]> {
  const [ev] = await rows<{ object_key: string }>(db, sql`select object_key from evidence where capture_id = ${captureId} and kind = 'text'`);
  const body = ev ? await store.get(ev.object_key) : null;
  if (body) return new TextDecoder().decode(body).split('\n\n');
  const blocks = await rows<{ text: string }>(db, sql`select text from capture_block where capture_id = ${captureId} order by ord`);
  if (blocks.length > 0) return blocks.map((b) => b.text);
  return changeText ? [changeText] : [];
}

/**
 * Reads the demo client's latest approved/sent brief (read-only, service role). Raw ids stay; `finalizeSampleBrief` renames and re-keys.
 * Evidence is text only: page text, review rows, ad copy, rank summaries — never screenshots, html or vendor json.
 */
export async function collectSampleBrief(db: Db, store: ObjectStore, clientName = 'Lone Star Cooling'): Promise<{ raw: SampleBriefData; sources: RenameSources }> {
  const clients = await rows<{ id: string; name: string; keywords: string[]; service_area: { towns?: string[] } }>(db,
    sql`select id, name, keywords, service_area from client where name = ${clientName} and status = 'active'`);
  if (clients.length !== 1) throw new Error(`sample brief: expected one active client named like the demo client, found ${clients.length}`);
  const c = clients[0]!;

  const tracked = await rows<{ id: string; name: string; domain: string | null; place_id: string | null; tier: RivalTier | null }>(db, sql`
    select co.id, co.name, co.domain, co.place_id, s.tier from client_competitor cc join competitor co on co.id = cc.competitor_id
    left join competitor_signal s on s.client_id = cc.client_id and s.competitor_id = co.id where cc.client_id = ${c.id}`);
  const rivals = tracked.map((t) => ({ id: t.id, name: t.name, tier: t.tier ?? 'minor' }))
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.name.localeCompare(b.name));
  const [self] = await rows<{ domain: string | null }>(db, sql`select co.domain from client cl join competitor co on co.id = cl.self_competitor_id where cl.id = ${c.id}`);

  const briefs = await rows<{ id: string; period_start: Date; period_end: Date }>(db,
    sql`select id, period_start, period_end from brief where client_id = ${c.id} and status in ('approved', 'sent') order by period_end desc limit 4`);
  if (briefs.length === 0) throw new Error('sample brief: the demo client has no approved or sent brief');
  type ItemRow = { id: string; brief_id: string; competitor_id: string | null; headline: string; what_changed: string; why_it_matters: string; recommended_action: string; event_ids: string[] };
  const picked: ItemRow[] = [];
  for (const b of briefs) {
    if (picked.length >= MIN_ITEMS) break;
    // upsell_tag is agency-only and never selected.
    picked.push(...await rows<ItemRow>(db, sql`
      select id, brief_id, competitor_id, headline, what_changed, why_it_matters, recommended_action, event_ids
      from brief_item where brief_id = ${b.id} and status = 'active' order by ord`));
  }
  const itemRows = picked.slice(0, MAX_ITEMS);

  const evidence: Record<string, SampleEvidence> = {};
  const rankGrid = await collectRankGrid(db, c, tracked, evidence);
  const rankEvidenceFor = (at: Date) => Object.values(evidence).filter((e) => e.kind === 'rank' && e.weekOf <= day(at)).at(-1)?.id;

  const items: Item[] = [];
  for (const row of itemRows) {
    const period = briefs.find((b) => b.id === row.brief_id)!;
    const [ev] = await rows<{ id: string; change_type: string; details: { items?: { id: string }[] }; occurred_at: Date }>(db,
      sql`select id, change_type, details, occurred_at from event where id = ${row.event_ids[0] ?? null}::uuid and retracted_at is null`);
    const kind = (ev && KIND_OF[ev.change_type]) || 'listing';
    const evidenceIds: string[] = [];
    const add = (e: SampleEvidence) => { evidence[e.id] = e; evidenceIds.push(e.id); };
    const rivalId = row.competitor_id;
    if (ev && rivalId && kind === 'website') {
      const [ch] = await rows<{ before_capture_id: string | null; after_capture_id: string | null; before_text: string | null; after_text: string | null }>(db, sql`
        select dc.before_capture_id, dc.after_capture_id, dc.before_text, dc.after_text from event_change ec join detected_change dc on dc.id = ec.change_id where ec.event_id = ${ev.id} limit 1`);
      if (ch?.before_capture_id && ch.after_capture_id) {
        const [cap] = await rows<{ url: string | null; captured_at: Date }>(db, sql`select url, captured_at from capture where id = ${ch.after_capture_id}`);
        const before = await pageTexts(db, store, ch.before_capture_id, ch.before_text);
        const after = await pageTexts(db, store, ch.after_capture_id, ch.after_text);
        const changed = after.findIndex((t, i) => t !== before[i]);
        // The seed's page title is the competitor's name (evidence.ts PageMock).
        const title = tracked.find((t) => t.id === rivalId)?.name ?? '';
        if (cap && after.length > 0) add({ id: `snapshot:${ch.after_capture_id}`, kind: 'snapshot', rivalId, url: cap.url ?? '', capturedAt: iso(cap.captured_at), title, before, after, changed: Math.max(0, changed) });
      }
    } else if (ev && rivalId && kind === 'ads') {
      const ids = (ev.details.items ?? []).map((x) => x.id);
      const ads = await rows<{ id: string; platform: string; title: string | null; text: string | null; started_at: Date | null; first_seen_at: Date }>(db, sql`
        select id, platform, title, text, started_at, first_seen_at from ad where competitor_id = ${rivalId} and external_id in ${ids.length ? ids : ['']} order by external_id limit ${MAX_ADS}`);
      for (const a of ads) {
        add({ id: `ad:${a.id}`, kind: 'ad', rivalId, platform: a.platform === 'meta' ? 'meta' : 'google', firstSeen: day(a.started_at ?? a.first_seen_at), headline: a.title ?? 'Untitled', body: a.text ?? '' });
      }
    } else if (ev && rivalId && kind === 'reviews') {
      const window = sql`competitor_id = ${rivalId} and posted_at >= ${iso(period.period_start)}::timestamptz and posted_at < ${iso(period.period_end)}::timestamptz`;
      const [{ n } = { n: 0 }] = await rows<{ n: number }>(db, sql`select count(*)::int as n from review where ${window}`);
      const list = await rows<{ rating: number | null; posted_at: Date; text: string }>(db,
        sql`select rating, posted_at, text from review where ${window} and text is not null and rating is not null order by posted_at desc limit ${MAX_REVIEWS}`);
      add({
        id: `reviews:${row.id}`, kind: 'reviews', rivalId, from: day(period.period_start), to: day(period.period_end), count: Number(n),
        reviews: list.map((r, i) => ({ author: `Reviewer ${'ABCDE'[i]}`, rating: r.rating!, date: day(r.posted_at), text: r.text })),
      });
    } else if (ev && kind === 'rank') {
      const id = rankEvidenceFor(ev.occurred_at);
      if (id) evidenceIds.push(id);
    }
    items.push({ id: row.id, rivalId, kind, headline: row.headline, whatChanged: row.what_changed, whyItMatters: row.why_it_matters, recommendedAction: row.recommended_action, evidenceIds });
  }

  const resultTitles = await rows<{ title: string; domain: string | null }>(db, sql`
    select distinct r->>'title' as title, r->>'domain' as domain from rank_snapshot s cross join jsonb_array_elements(s.results) r
    where s.client_id = ${c.id} and s.keyword = ${rankGrid.keyword} and r->>'title' is not null`);
  const sources: RenameSources = {
    client: c.name,
    businesses: [...new Set([...tracked.map((t) => t.name), ...resultTitles.map((t) => t.title)])].filter((n) => n !== c.name),
    places: [...DEMO_PLACES],
    domains: [...new Set([...tracked.map((t) => t.domain), self?.domain ?? null, ...resultTitles.map((t) => t.domain)].filter((d): d is string => !!d))],
  };
  const raw: SampleBriefData = {
    version: 1, label: 'Sample data', business: { name: c.name, vertical: VERTICAL, area: c.service_area.towns?.[0] ?? '' },
    weekOf: day(briefs[0]!.period_end), rivals, items, evidence, rankGrid,
  };
  return { raw, sources };
}

/** The 12 latest done scans of keyword 0: per cell the client's own rank (title match) and, per week, the rival ranked first in most cells. */
async function collectRankGrid(db: Db, c: { id: string; name: string; keywords: string[] }, tracked: { id: string; name: string; place_id: string | null }[], evidence: Record<string, SampleEvidence>): Promise<SampleBriefData['rankGrid']> {
  const keyword = c.keywords[0];
  if (!keyword) throw new Error('sample brief: the demo client has no keywords');
  const scans = (await rows<{ id: string; finished_at: Date; grid_size: number | null }>(db,
    sql`select id, finished_at, grid_size from rank_scan where client_id = ${c.id} and status = 'done' order by finished_at desc limit ${WEEKS}`)).reverse();
  if (scans.length === 0) throw new Error('sample brief: the demo client has no done rank scans');
  const snaps = await rows<{ scan_id: string; lat: number; lng: number; results: { rank: number; title: string; placeId: string | null }[] }>(db,
    sql`select scan_id, lat, lng, results from rank_snapshot where scan_id in ${scans.map((s) => s.id)} and keyword = ${keyword}`);
  const size = scans[0]!.grid_size ?? 7;
  // Grid rows run north to south, columns west to east; coordinates are identical across scans of the same settings.
  const lats = [...new Set(snaps.map((s) => s.lat))].sort((a, b) => b - a);
  const lngs = [...new Set(snaps.map((s) => s.lng))].sort((a, b) => a - b);
  if (lats.length > size || lngs.length > size) throw new Error('sample brief: rank snapshots do not form one grid');
  const rivalOf = (r: { title: string; placeId: string | null }) => tracked.find((t) => (r.placeId && t.place_id === r.placeId) || t.name === r.title)?.id ?? null;
  const weeks: Week[] = [];
  for (const scan of scans) {
    const you: (number | null)[] = Array(size * size).fill(null);
    const leads = new Map<string, number>();
    for (const s of snaps.filter((x) => x.scan_id === scan.id)) {
      const cell = lats.indexOf(s.lat) * size + lngs.indexOf(s.lng);
      you[cell] = s.results.find((r) => r.title === c.name)?.rank ?? null;
      const top = s.results.find((r) => r.rank === 1);
      const lead = top ? rivalOf(top) : null;
      if (lead) leads.set(lead, (leads.get(lead) ?? 0) + 1);
    }
    const leaderRivalId = [...leads.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const weekOf = day(scan.finished_at);
    weeks.push({ weekOf, you, leaderRivalId });
    const top3 = you.filter((r) => r !== null && r <= 3).length;
    evidence[`rank:${scan.id}`] = { id: `rank:${scan.id}`, kind: 'rank', keyword, weekOf, summary: `top 3 in ${top3} of ${size * size} points` };
  }
  return { keyword, size, weeks };
}

export class SampleBriefGuardError extends Error {
  constructor(readonly hits: GuardHit[]) {
    super(`sample brief: ${hits.length} guard hit(s)`);
  }
}

const oneOf = <T extends string>(v: string, allowed: readonly T[], what: string): T => {
  if (!(allowed as readonly string[]).includes(v)) throw new Error(`sample brief: unknown ${what}`);
  return v as T;
};
const num = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('sample brief: expected a number');
  return v;
};

/**
 * Rebuilds every object field by field from the SampleBriefData keys (unknown keys such as upsell_tag drop by construction),
 * renames every string, re-keys ids (r1…, i1…, e1…) with every reference rewritten, then guards. Throws SampleBriefGuardError on any hit.
 */
export function finalizeSampleBrief(raw: SampleBriefData, sources: RenameSources): SampleBriefData {
  const renamer = buildRenamer(sources);
  const r = (s: string) => renamer.apply(s);
  const rivalIds = new Map(raw.rivals.map((x, i) => [x.id, `r${i + 1}`]));
  const rid = (id: string) => {
    const v = rivalIds.get(id);
    if (!v) throw new Error('sample brief: unknown rival id');
    return v;
  };
  const referenced = raw.items.flatMap((i) => i.evidenceIds);
  for (const k of referenced) if (!(k in raw.evidence)) throw new Error('sample brief: unknown evidence id');
  const evIds = new Map([...new Set([...referenced, ...Object.keys(raw.evidence)])].map((k, i) => [k, `e${i + 1}`]));

  const evidence: Record<string, SampleEvidence> = {};
  for (const [key, id] of evIds) {
    const e = raw.evidence[key]!;
    switch (e.kind) {
      case 'snapshot':
        evidence[id] = { id, kind: 'snapshot', rivalId: rid(e.rivalId), url: r(e.url), capturedAt: r(e.capturedAt), title: r(e.title), before: e.before.map(r), after: e.after.map(r), changed: num(e.changed) };
        break;
      case 'reviews':
        evidence[id] = {
          id, kind: 'reviews', rivalId: rid(e.rivalId), from: r(e.from), to: r(e.to), count: num(e.count),
          reviews: e.reviews.map((x) => ({ author: r(x.author), rating: num(x.rating), date: r(x.date), text: r(x.text) })),
        };
        break;
      case 'ad':
        evidence[id] = { id, kind: 'ad', rivalId: rid(e.rivalId), platform: oneOf(e.platform, PLATFORMS, 'ad platform'), firstSeen: r(e.firstSeen), headline: r(e.headline), body: r(e.body) };
        break;
      case 'rank':
        evidence[id] = { id, kind: 'rank', keyword: r(e.keyword), weekOf: r(e.weekOf), summary: r(e.summary) };
        break;
      default:
        throw new Error('sample brief: unknown evidence kind');
    }
  }

  const out: SampleBriefData = {
    version: 1, label: 'Sample data',
    business: { name: r(raw.business.name), vertical: r(raw.business.vertical), area: r(raw.business.area) },
    weekOf: r(raw.weekOf),
    rivals: raw.rivals.map((x) => ({ id: rid(x.id), name: r(x.name), tier: oneOf(x.tier, TIERS, 'tier') })),
    items: raw.items.map((x, i) => ({
      id: `i${i + 1}`, rivalId: x.rivalId === null ? null : rid(x.rivalId), kind: oneOf(x.kind, KINDS, 'item kind'),
      headline: r(x.headline), whatChanged: r(x.whatChanged), whyItMatters: r(x.whyItMatters), recommendedAction: r(x.recommendedAction),
      evidenceIds: x.evidenceIds.map((k) => evIds.get(k)!),
    })),
    evidence,
    rankGrid: {
      keyword: r(raw.rankGrid.keyword), size: num(raw.rankGrid.size),
      weeks: raw.rankGrid.weeks.map((w) => ({ weekOf: r(w.weekOf), you: w.you.map((x) => (x === null ? null : num(x))), leaderRivalId: w.leaderRivalId === null ? null : rid(w.leaderRivalId) })),
    },
  };

  const deny = [...new Set([...renamer.terms.keys(), ...Object.keys(STATE_TERMS), ...DEMO_REAL_BUSINESS_WORDS, ...DEMO_ZIPS, ...EXTRA_DENY])];
  const allowDomains = new Set([...renamer.terms.values()].filter((v) => v.endsWith('.example')).map((v) => v.toLowerCase()));
  const hits = guard(out, deny, allowDomains);
  if (hits.length > 0) throw new SampleBriefGuardError(hits);
  return out;
}
