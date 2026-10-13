import { redactForModel } from '@cs/collectors';
import { type AccessContext, appLinkFor, hasFeature, renderKbText, ToolError } from '@cs/core';
import { alert, briefItem, kbArticle, capture, captureBlock, changeEvent, client, clientCompetitor, competitor, eventScore, evidence, recommendation, review, trackedPage, withTenant } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { getAlert } from '@cs/engine';
import { and, asc, desc, eq, exists, inArray, isNull } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import { kbNamesFor } from '../kb/names';
import { briefDetail } from '../tools/briefs';
import { competitorLinked } from '../workspace/evidence-access';
import { eventEvidenceIds } from '../workspace/events-read';
import { channelLabel, detailLines, factView, humanise } from '../workspace/labels';
import { eventJoin } from '../workspace/scope';
import { type ActiveClient, activeClients, DASHBOARD_ITEM_TYPES, requireActiveClient } from './scope';

export const ITEM_TYPES = ['event', 'evidence', 'brief', 'brief_item', 'recommendation', 'alert', 'review', 'page', 'knowledge'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export interface FetchOutput {
  id: string;
  title: string;
  text: string;
  url: string;
  /** P5: the ChatGPT-connector shape (snake_case keys). */
  metadata: { type: string; client_id: string; evidence_ids: string[]; occurred_at?: string };
}

/** d12 / spec: the cap on captured text returned by `fetch` (evidence text, page blocks). */
export const FETCH_TEXT_CHARS = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** One message for every refusal — malformed, unknown, hidden, prospect — so ids can't be probed. */
const NOT_FOUND = 'Not found';
const notFound = (): ToolError => new ToolError('not_found', NOT_FOUND);

/** `<type>:<uuid>` → its parts; null for anything else (unknown or upper-case type, extra segments, non-uuid). */
export function parseItemId(id: string): { type: ItemType; uuid: string } | null {
  const parts = id.split(':');
  if (parts.length !== 2) return null;
  const [type, uuid] = parts as [string, string];
  if (!(ITEM_TYPES as readonly string[]).includes(type) || !UUID.test(uuid)) return null;
  return { type: type as ItemType, uuid: uuid.toLowerCase() };
}

/**
 * d12 on every channel, with the business names never mistaken for people. Redacts a window larger than the cap and
 * then cuts, so a contact detail straddling the cap is redacted whole rather than leaking as a fragment.
 */
const redact = (text: string, names: readonly (string | null | undefined)[], cap: number | null = FETCH_TEXT_CHARS): string =>
  cap === null ? redactForModel(text, { businessNames: names }) : redactForModel(text.slice(0, cap * 2), { businessNames: names }).slice(0, cap);
const day = (d: Date): string => d.toISOString().slice(0, 10);
const LEVEL: Record<string, string> = { L: 'Low', M: 'Medium', H: 'High' };
const REC_STATUS: Record<string, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done', dismissed: 'Dismissed' };
const EVIDENCE_KIND: Record<string, string> = { screenshot: 'Screenshot', text: 'Page text', html: 'Page HTML', vendor_json: 'Vendor data' };

/** The client's own name and its tracked competitors' names (RLS): business names in model-written text are never people. */
async function clientNames(deps: ToolDeps, ctx: AccessContext, clientId: string): Promise<string[]> {
  return withTenant(deps.app, ctx, async (tx) => [
    ...(await tx.select({ name: client.name }).from(client).where(eq(client.id, clientId))).map((r) => r.name),
    ...(await tx.select({ name: competitor.name }).from(clientCompetitor).innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
      .where(eq(clientCompetitor.clientId, clientId))).map((r) => r.name),
  ]);
}

/** P18: the first candidate (resolution order) that can see the item, or `not_found`. */
function firstOf(candidates: ActiveClient[], visible: Iterable<string>): ActiveClient {
  const ok = new Set(visible);
  const c = candidates.find((x) => ok.has(x.id));
  if (!c) throw notFound();
  return c;
}

/**
 * Any item by type and id, as the caller may see it — shared by the `fetch` tool and the MCP `evidence://` / `brief://`
 * resources. Every refusal is `not_found` "Not found". Global rows (event, evidence, review, page) resolve the client per
 * P18; tenant rows (brief, brief_item, recommendation, alert) carry their own. `screenshotKey` is for the resources only.
 */
export async function fetchItem(deps: ToolDeps, ctx: AccessContext, type: ItemType, id: string): Promise<FetchOutput & { screenshotKey?: string }> {
  if (!UUID.test(id) || !(ITEM_TYPES as readonly string[]).includes(type)) throw notFound();
  if (DASHBOARD_ITEM_TYPES.has(type) && !hasFeature(ctx, 'dashboard')) throw notFound();
  const uuid = id.toLowerCase();
  try {
    switch (type) {
      case 'event': return await fetchEvent(deps, ctx, uuid);
      case 'evidence': return await fetchEvidence(deps, ctx, uuid);
      case 'brief': return await fetchBrief(deps, ctx, uuid);
      case 'brief_item': return await fetchBriefItem(deps, ctx, uuid);
      case 'recommendation': return await fetchRecommendation(deps, ctx, uuid);
      case 'alert': return await fetchAlert(deps, ctx, uuid);
      case 'review': return await fetchReview(deps, ctx, uuid);
      case 'page': return await fetchPage(deps, ctx, uuid);
      case 'knowledge': return await fetchKnowledge(deps, ctx, uuid);
    }
  } catch (e) {
    if (e instanceof ToolError && e.code === 'not_found') throw notFound();
    throw e;
  }
}

async function fetchEvent(deps: ToolDeps, ctx: AccessContext, id: string): Promise<FetchOutput> {
  const candidates = await activeClients(deps, ctx);
  if (candidates.length === 0) throw notFound();
  // Decision 3 (as `clientEvents`) across the candidate clients: scored for the client, competitor still tracked, not retracted.
  const rows = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ clientId: eventScore.clientId, name: competitor.name, changeType: changeEvent.changeType, summary: changeEvent.summary, facts: changeEvent.facts, details: changeEvent.details, occurredAt: changeEvent.occurredAt })
      .from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
      .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
      .where(and(eq(changeEvent.id, id), isNull(changeEvent.retractedAt), inArray(eventScore.clientId, candidates.map((c) => c.id)))));
  const c = firstOf(candidates, rows.map((r) => r.clientId));
  const r = rows.find((x) => x.clientId === c.id)!;
  const facts = (r.facts ?? []).map(factView).map((f) => `${humanise(f.kind)}: ${f.before ?? '—'} → ${f.after ?? '—'}${f.pct !== null ? ` (${f.pct > 0 ? '+' : ''}${f.pct}%)` : ''}`);
  const details = detailLines(r.details).map((d) => `${d.label}: ${d.value}`);
  const evidenceIds = (await eventEvidenceIds(deps, [id])).get(id) ?? []; // visibility proved above
  return {
    id: `event:${id}`, title: `${r.name}: ${changeTypeLabel(r.changeType)}`,
    text: redact([r.summary, ...facts, ...details].join('\n'), [r.name, c.name]),
    url: appLinkFor(deps.appUrl, { t: 'event', clientId: c.id, id }),
    metadata: { type: 'event', client_id: c.id, evidence_ids: evidenceIds, occurred_at: r.occurredAt.toISOString() },
  };
}

async function fetchEvidence(deps: ToolDeps, ctx: AccessContext, id: string): Promise<FetchOutput & { screenshotKey?: string }> {
  const [row] = await deps.service
    .select({ kind: evidence.kind, objectKey: evidence.objectKey, sha256: evidence.sha256, bytes: evidence.bytes, capturedAt: capture.capturedAt, url: capture.url,
      source: capture.source, competitorId: capture.competitorId, name: competitor.name })
    .from(evidence).innerJoin(capture, eq(capture.id, evidence.captureId)).innerJoin(competitor, eq(competitor.id, capture.competitorId))
    .where(eq(evidence.id, id));
  if (!row) throw notFound();
  const candidates = await activeClients(deps, ctx);
  if (candidates.length === 0) throw notFound();
  // Narrow to clients with any link to the competitor (RLS), then apply decision 7's exact rule in resolution order.
  const ids = candidates.map((c) => c.id);
  const linked = await withTenant(deps.app, ctx, async (tx) => [
    ...(await tx.select({ id: clientCompetitor.clientId }).from(clientCompetitor).where(and(eq(clientCompetitor.competitorId, row.competitorId), inArray(clientCompetitor.clientId, ids)))),
    ...(await tx.select({ id: alert.clientId }).from(alert).where(and(eq(alert.competitorId, row.competitorId), inArray(alert.clientId, ids)))),
    ...(await tx.select({ id: briefItem.clientId }).from(briefItem).where(and(eq(briefItem.competitorId, row.competitorId), inArray(briefItem.clientId, ids)))),
  ]);
  const maybe = new Set(linked.map((l) => l.id));
  let c: ActiveClient | undefined;
  for (const x of candidates) {
    if (maybe.has(x.id) && (await competitorLinked(deps, ctx, x.id, row.competitorId))) {
      c = x;
      break;
    }
  }
  if (!c) throw notFound();

  const where = row.url ?? `${row.name} (${channelLabel(row.source)})`;
  const captured = `captured ${day(row.capturedAt)}`;
  let text: string;
  let screenshotKey: string | undefined;
  if (row.kind === 'text') {
    if (!deps.evidenceStore) throw new ToolError('internal', 'Evidence storage is not configured');
    const bytes = await deps.evidenceStore.get(row.objectKey);
    text = bytes ? new TextDecoder('utf-8').decode(bytes) : `Text of ${where} ${captured} is no longer stored.`;
  } else if (row.kind === 'screenshot') {
    text = `Screenshot of ${where} ${captured}`;
    screenshotKey = row.objectKey;
  } else {
    // Decision 6: html / vendor_json are never returned (untrusted competitor markup) — a metadata line only.
    text = `${EVIDENCE_KIND[row.kind] ?? humanise(row.kind)} of ${where} ${captured} (${Number(row.bytes)} bytes, SHA-256 ${row.sha256}). The raw content is not shown.`;
  }
  return {
    id: `evidence:${id}`, title: `${row.name}: ${EVIDENCE_KIND[row.kind] ?? humanise(row.kind)}, ${day(row.capturedAt)}`,
    text: redact(text, [row.name, c.name]), url: appLinkFor(deps.appUrl, { t: 'evidence', clientId: c.id, id }),
    metadata: { type: 'evidence', client_id: c.id, evidence_ids: [id], occurred_at: row.capturedAt.toISOString() },
    ...(screenshotKey ? { screenshotKey } : {}),
  };
}

type BriefItemView = Awaited<ReturnType<typeof briefDetail>>['items'][number];
const itemText = (i: BriefItemView): string =>
  `${i.headline}\nWhat changed: ${i.whatChanged}\nWhy it matters: ${i.whyItMatters}\nRecommended action: ${i.recommendedAction}`;
const unionIds = (lists: string[][]): string[] => [...new Set(lists.flat())];

async function fetchBrief(deps: ToolDeps, ctx: AccessContext, id: string): Promise<FetchOutput> {
  const d = await briefDetail(deps, ctx, id); // visibility, status gate, upsell stripped for client roles
  await requireActiveClient(deps, ctx, d.clientId);
  const items = d.items.filter((i) => i.status === 'active').sort((a, b) => a.ord - b.ord); // never assume contiguous ord
  const names = [...items.map((i) => i.competitorName), ...(await clientNames(deps, ctx, d.clientId))];
  const text = [d.summary ?? '', ...items.map((i) => `## ${itemText(i)}`)].filter((s) => s !== '').join('\n\n');
  return {
    id: `brief:${id}`, title: `Weekly brief ${d.deliveryDate}`, text: redact(text, names, null),
    url: appLinkFor(deps.appUrl, { t: 'brief', id }),
    metadata: { type: 'brief', client_id: d.clientId, evidence_ids: unionIds(items.map((i) => i.evidenceIds)), occurred_at: d.deliveryDate },
  };
}

async function fetchBriefItem(deps: ToolDeps, ctx: AccessContext, id: string): Promise<FetchOutput> {
  const [row] = await withTenant(deps.app, ctx, (tx) => tx.select({ briefId: briefItem.briefId, status: briefItem.status }).from(briefItem).where(eq(briefItem.id, id)));
  if (!row || row.status !== 'active') throw notFound();
  const d = await briefDetail(deps, ctx, row.briefId); // the item is visible only through its brief's status gate
  await requireActiveClient(deps, ctx, d.clientId);
  const item = d.items.find((i) => i.id === id && i.status === 'active');
  if (!item) throw notFound();
  return {
    id: `brief_item:${id}`, title: item.headline, text: redact(itemText(item), [item.competitorName, ...(await clientNames(deps, ctx, d.clientId))]),
    url: appLinkFor(deps.appUrl, { t: 'brief_item', id }),
    metadata: { type: 'brief_item', client_id: d.clientId, evidence_ids: unionIds([item.evidenceIds]), occurred_at: d.deliveryDate },
  };
}

async function fetchRecommendation(deps: ToolDeps, ctx: AccessContext, id: string): Promise<FetchOutput> {
  // upsell_tag is never selected.
  const [r] = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ clientId: recommendation.clientId, title: recommendation.title, rationale: recommendation.rationale, status: recommendation.status, effort: recommendation.effort,
      impact: recommendation.impact, evidenceIds: recommendation.evidenceIds, createdAt: recommendation.createdAt })
      .from(recommendation).where(eq(recommendation.id, id)));
  if (!r) throw notFound();
  await requireActiveClient(deps, ctx, r.clientId);
  const text = `${r.rationale}\n\nStatus: ${REC_STATUS[r.status] ?? humanise(r.status)}\nEffort: ${LEVEL[r.effort] ?? r.effort}\nImpact: ${LEVEL[r.impact] ?? r.impact}`;
  return {
    id: `recommendation:${id}`, title: r.title, text: redact(text, await clientNames(deps, ctx, r.clientId)), url: appLinkFor(deps.appUrl, { t: 'recommendation', clientId: r.clientId, id }),
    metadata: { type: 'recommendation', client_id: r.clientId, evidence_ids: unionIds([r.evidenceIds]), occurred_at: r.createdAt.toISOString() },
  };
}

async function fetchAlert(deps: ToolDeps, ctx: AccessContext, id: string): Promise<FetchOutput> {
  const a = await getAlert({ app: deps.app }, ctx, id); // client roles: delivered only
  await requireActiveClient(deps, ctx, a.clientId);
  const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, a.competitorId)));
  return {
    id: `alert:${id}`, title: a.headline, text: redact(a.body, [c?.name, ...(await clientNames(deps, ctx, a.clientId))]), url: appLinkFor(deps.appUrl, { t: 'alert', id }),
    metadata: { type: 'alert', client_id: a.clientId, evidence_ids: unionIds([a.evidenceIds]), occurred_at: (a.deliveredAt ?? a.createdAt).toISOString() },
  };
}

async function fetchReview(deps: ToolDeps, ctx: AccessContext, id: string): Promise<FetchOutput> {
  // Global row; reviewer_hash is never selected (spec 4.5).
  const [r] = await deps.service
    .select({ competitorId: review.competitorId, name: competitor.name, rating: review.rating, text: review.text, postedAt: review.postedAt, ownerAnswer: review.ownerAnswer })
    .from(review).innerJoin(competitor, eq(competitor.id, review.competitorId)).where(eq(review.id, id));
  if (!r) throw notFound();
  const candidates = await activeClients(deps, ctx);
  if (candidates.length === 0) throw notFound();
  // `workspaceBusinesses`' set: the client's tracked competitors (RLS) or its own business.
  const tracking = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: clientCompetitor.clientId }).from(clientCompetitor)
      .where(and(eq(clientCompetitor.competitorId, r.competitorId), inArray(clientCompetitor.clientId, candidates.map((c) => c.id)))));
  const c = firstOf(candidates, [...tracking.map((t) => t.id), ...candidates.filter((x) => x.selfCompetitorId === r.competitorId).map((x) => x.id)]);
  const name = c.selfCompetitorId === r.competitorId ? c.name : r.name;
  const lines = [`Rating: ${r.rating !== null ? `${r.rating}/5` : 'none'}`, `Date: ${r.postedAt ? day(r.postedAt) : 'unknown'}`, '', r.text ?? '(no text)'];
  if (r.ownerAnswer) lines.push('', `Owner answer: ${r.ownerAnswer}`);
  return {
    id: `review:${id}`, title: `${name} review${r.rating ? `, ${r.rating}★` : ''}`, text: redact(lines.join('\n'), [name, r.name, c.name]),
    url: appLinkFor(deps.appUrl, { t: 'review', clientId: c.id, id }),
    metadata: { type: 'review', client_id: c.id, evidence_ids: [], ...(r.postedAt ? { occurred_at: r.postedAt.toISOString() } : {}) },
  };
}

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

async function fetchPage(deps: ToolDeps, ctx: AccessContext, id: string): Promise<FetchOutput> {
  const [p] = await deps.service
    .select({ competitorId: trackedPage.competitorId, url: trackedPage.url, active: trackedPage.active, name: competitor.name })
    .from(trackedPage).innerJoin(competitor, eq(competitor.id, trackedPage.competitorId)).where(eq(trackedPage.id, id));
  if (!p || !p.active) throw notFound();
  const candidates = await activeClients(deps, ctx);
  if (candidates.length === 0) throw notFound();
  // A tracked competitor (RLS) of the client, never the client's own business (as `search`'s page hits).
  const tracking = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: clientCompetitor.clientId }).from(clientCompetitor)
      .where(and(eq(clientCompetitor.competitorId, p.competitorId), inArray(clientCompetitor.clientId, candidates.map((c) => c.id)))));
  const c = firstOf(candidates.filter((x) => x.selfCompetitorId !== p.competitorId), tracking.map((t) => t.id));
  // Latest capture with extracted blocks; visibility proved above, so the global rows come from the service Db.
  const [cap] = await deps.service.select({ id: capture.id, capturedAt: capture.capturedAt }).from(capture)
    .where(and(eq(capture.trackedPageId, id), exists(deps.service.select({ one: captureBlock.id }).from(captureBlock).where(eq(captureBlock.captureId, capture.id)))))
    .orderBy(desc(capture.capturedAt), desc(capture.id)).limit(1);
  const blocks = cap ? await deps.service.select({ text: captureBlock.text }).from(captureBlock).where(eq(captureBlock.captureId, cap.id)).orderBy(asc(captureBlock.ord)) : [];
  const ev = cap ? await deps.service.select({ id: evidence.id }).from(evidence)
    .where(and(eq(evidence.captureId, cap.id), inArray(evidence.kind, ['text', 'screenshot']))).orderBy(asc(evidence.kind), asc(evidence.id)) : [];
  return {
    id: `page:${id}`, title: `${p.name}: ${pathOf(p.url)}`,
    text: cap ? redact(blocks.map((b) => b.text).join('\n\n'), [p.name, c.name]) : `No text has been captured from ${p.url} yet.`,
    url: appLinkFor(deps.appUrl, { t: 'page', clientId: c.id, competitorId: p.competitorId }),
    metadata: { type: 'page', client_id: c.id, evidence_ids: ev.map((e) => e.id), ...(cap ? { occurred_at: cap.capturedAt.toISOString() } : {}) },
  };
}

/** A published, RLS-visible article (as `get_kb_article`), rendered with the agency's names and then redacted. Client-level articles also need an active, accessible client. */
async function fetchKnowledge(deps: ToolDeps, ctx: AccessContext, id: string): Promise<FetchOutput> {
  const [a] = await withTenant(deps.app, ctx, (tx) => tx.select().from(kbArticle).where(and(eq(kbArticle.id, id), eq(kbArticle.status, 'published'))));
  if (!a) throw notFound();
  if (a.clientId) await requireActiveClient(deps, ctx, a.clientId);
  const names = await kbNamesFor(deps.service, ctx.agencyId);
  const text = (t: string): string => redactForModel(renderKbText(t, names));
  return {
    id: `knowledge:${id}`, title: text(a.title), text: text(a.bodyMd), url: appLinkFor(deps.appUrl, { t: 'kb', id }),
    metadata: { type: 'knowledge', client_id: a.clientId ?? '', evidence_ids: [] },
  };
}
