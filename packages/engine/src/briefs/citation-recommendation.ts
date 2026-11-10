import { auditedCompetitors } from '@cs/collectors';
import { brief, client, type Db, feedback, recommendation } from '@cs/db';
import { citationCatalogue, type VerticalPack } from '@cs/verticals';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { loadClientRunbook } from '../runbook/store';
import type { PackLoader } from '../tag/tag-stage';
import { citationGapFinding } from './self-rules';
import { loadSelfCitations } from './starting-point';

/** A `fix_citations` recommendation the owner or agency finished or dismissed is not offered again for this long (a system auto-close does not count). */
export const CITATION_REC_COOLDOWN_DAYS = 90;
export const CITATION_REC_CLOSED_REASON = 'The listings check no longer flags this gap.';
const RULE_ID = 'citation_gap';
const PLAY_ID = 'fix_citations';

export type CitationRecOutcome = { outcome: 'created' | 'refreshed' | 'closed' | 'skipped'; reason?: string };

/**
 * 18c-1 T8b: after a finished listings audit, a client whose starting point already went out gets one evidence-backed `fix_citations`
 * recommendation on the board while the gap lasts (the starting point owns the finding before that). Deterministic text only: the fixed
 * finding fact and the play title; no model call, no verifier; `upsell_tag` stays null. A closed gap closes its untouched `todo` row.
 */
export async function recommendForCitations(
  deps: { db: Db; packs: PackLoader; generic: () => Promise<VerticalPack>; now?: () => Date },
  clientId: string,
): Promise<CitationRecOutcome> {
  const now = deps.now?.() ?? new Date();
  const { db } = deps;
  const [c] = await db.select({ agencyId: client.agencyId, status: client.status, verticalId: client.verticalId, selfId: client.selfCompetitorId })
    .from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) return { outcome: 'skipped', reason: 'client not found' };
  if (c.status !== 'active') return { outcome: 'skipped', reason: `client is ${c.status}` };
  const [sp] = await db.select({ status: brief.status }).from(brief).where(and(eq(brief.clientId, clientId), eq(brief.kind, 'starting_point'))).limit(1);
  if (!sp || (sp.status !== 'approved' && sp.status !== 'sent')) return { outcome: 'skipped', reason: 'starting point not out yet' };

  const runbook = await loadClientRunbook(deps, clientId);
  const rule = runbook.selfRules.find((r) => r.id === RULE_ID);
  const play = runbook.plays.find((p) => p.id === PLAY_ID);
  if (!rule || !play) return { outcome: 'skipped', reason: 'citation_gap or fix_citations not enabled' };

  const pack = await deps.packs(c.verticalId);
  const audited = await auditedCompetitors(db, clientId);
  const citations = await loadSelfCitations(db, clientId, c.selfId, citationCatalogue(pack), audited.rivalIds);
  if (!citations) return { outcome: 'skipped', reason: 'no own listings audited' };
  const finding = citationGapFinding(rule, citations, runbook.plays);

  const mine = await db.select().from(recommendation).where(and(eq(recommendation.clientId, clientId), eq(recommendation.playbookId, PLAY_ID)));
  const live = mine.filter((r) => r.status === 'todo' || r.status === 'in_progress');

  if (!finding) {
    // Gap closed: only our own untouched rows close; work already started and other sources are left alone.
    const open = live.filter((r) => r.source === 'listings' && r.status === 'todo');
    if (open.length === 0) return { outcome: 'skipped', reason: 'no gap and nothing to close' };
    await db.transaction(async (tx) => {
      const closed = await tx.update(recommendation).set({ status: 'done', dismissReason: null, updatedAt: now })
        .where(and(inArray(recommendation.id, open.map((r) => r.id)), eq(recommendation.status, 'todo')))
        .returning({ id: recommendation.id, agencyId: recommendation.agencyId, clientId: recommendation.clientId });
      if (closed.length > 0) {
        await tx.insert(feedback).values(closed.map((r) => ({
          agencyId: r.agencyId, clientId: r.clientId, subjectType: 'recommendation', subjectId: r.id, kind: 'status', actor: 'system',
          before: { status: 'todo' }, after: { status: 'done' }, reason: CITATION_REC_CLOSED_REASON,
        })));
      }
    });
    return { outcome: 'closed' };
  }

  if (live.length > 0) {
    const own = live.find((r) => r.source === 'listings' && r.status === 'todo');
    if (!own) return { outcome: 'skipped', reason: 'a live fix_citations recommendation exists' };
    const same = own.rationale === finding.fact && JSON.stringify(own.evidenceIds) === JSON.stringify(finding.evidenceIds);
    if (!same) await db.update(recommendation).set({ rationale: finding.fact, evidenceIds: finding.evidenceIds, updatedAt: now }).where(eq(recommendation.id, own.id));
    return { outcome: 'refreshed' };
  }
  const cutoff = now.getTime() - CITATION_REC_COOLDOWN_DAYS * 86_400_000;
  const recent = mine.filter((r) => (r.status === 'done' || r.status === 'dismissed') && r.updatedAt.getTime() > cutoff);
  // Auto only when the LATEST feedback row is the system close; any later user action means the hold applies.
  const latest = new Map<string, { actor: string; reason: string | null }>();
  if (recent.length > 0) {
    const rows = await db.select({ id: feedback.subjectId, actor: feedback.actor, reason: feedback.reason }).from(feedback)
      .where(and(eq(feedback.subjectType, 'recommendation'), inArray(feedback.subjectId, recent.map((r) => r.id)))).orderBy(desc(feedback.createdAt), desc(feedback.id));
    for (const r of rows) if (!latest.has(r.id)) latest.set(r.id, r);
  }
  const autoIds = new Set([...latest].filter(([, l]) => l.actor === 'system' && l.reason === CITATION_REC_CLOSED_REASON).map(([id]) => id));
  if (recent.some((r) => !autoIds.has(r.id))) return { outcome: 'skipped', reason: 'recently closed by the owner' };

  const version = runbook.plays.find((p) => p.id === finding.playbookId)?.version ?? 0;
  const inserted = await db.insert(recommendation).values({
    agencyId: c.agencyId, clientId, source: 'listings', title: play.title, rationale: finding.fact, evidenceIds: finding.evidenceIds, eventIds: [],
    playbookId: finding.playbookId, playbookVersion: version > 0 ? version : null, effort: finding.effort, impact: finding.impact, owner: 'client', upsellTag: null,
  }).onConflictDoNothing().returning({ id: recommendation.id });
  return inserted.length > 0 ? { outcome: 'created' } : { outcome: 'skipped', reason: 'a live listings recommendation already exists' };
}
