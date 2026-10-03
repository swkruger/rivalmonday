import { changeEvent, competitor, decisionReview, detectedChange, eventChange, eventScore, moveEvent, trackedPage, type Tx } from '@cs/db';
import { and, asc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { buildStructuredSummary } from '../tag/structured';
import { buildSummary, redactFacts } from '../tag/tag-stage';

export type RetractionReason = 'superseded' | 'review';

/**
 * After a change is detached, the event's summary and facts must describe the evidence it still has (briefs read
 * them, Phase 4a): the oldest remaining live change provides the summary, every remaining change its facts.
 */
export async function rebuildEventText(tx: Tx, eventId: string): Promise<void> {
  const rows = await tx
    .select({ change: detectedChange, name: competitor.name, pageUrl: trackedPage.url })
    .from(eventChange)
    .innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId))
    .innerJoin(competitor, eq(competitor.id, detectedChange.competitorId))
    .leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
    .where(and(eq(eventChange.eventId, eventId), eq(detectedChange.status, 'event')))
    .orderBy(asc(detectedChange.detectedAt), asc(detectedChange.id));
  const first = rows[0];
  if (!first) return;
  const names = [first.name];
  const summary = first.change.source === 'web' ? buildSummary(first.change, first.pageUrl, names) : buildStructuredSummary(first.change, names);
  const facts = redactFacts(rows.flatMap((r) => r.change.numericChanges), names);
  await tx.update(changeEvent).set({ summary, facts }).where(eq(changeEvent.id, eventId));
}

/**
 * Soft-retracts an event (Phase 3d decision 6): the row and its evidence chain stay for audit; its per-client
 * scores and move links go in the same transaction, so a retracted event can never reach a brief or a move.
 */
export async function retractEvent(tx: Tx, eventId: string, reason: RetractionReason): Promise<void> {
  await tx.update(changeEvent).set({ retractedAt: new Date(), retractionReason: reason }).where(and(eq(changeEvent.id, eventId), isNull(changeEvent.retractedAt)));
  await tx.delete(eventScore).where(eq(eventScore.eventId, eventId));
  await tx.delete(moveEvent).where(eq(moveEvent.eventId, eventId));
}

/**
 * Withdraws one change from its event. With other evidence left, the link is removed and the event's channels are
 * recomputed; when it was the only evidence, the link is kept (audit) and the event is retracted instead.
 */
export async function detachChange(tx: Tx, changeId: string, reason: RetractionReason): Promise<{ eventId: string; retracted: boolean } | null> {
  const [link] = await tx.select({ eventId: eventChange.eventId }).from(eventChange).where(eq(eventChange.changeId, changeId)).limit(1);
  if (!link) return null;
  const [others] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(eventChange)
    .where(and(eq(eventChange.eventId, link.eventId), ne(eventChange.changeId, changeId)));
  if ((others?.n ?? 0) === 0) {
    await retractEvent(tx, link.eventId, reason);
    return { eventId: link.eventId, retracted: true };
  }
  await tx.delete(eventChange).where(eq(eventChange.changeId, changeId));
  const channels = await tx
    .selectDistinct({ source: detectedChange.source })
    .from(eventChange)
    .innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId))
    .where(eq(eventChange.eventId, link.eventId));
  await tx.update(changeEvent).set({ channels: channels.map((c) => c.source).sort() }).where(eq(changeEvent.id, link.eventId));
  await rebuildEventText(tx, link.eventId);
  return { eventId: link.eventId, retracted: false };
}

export type SupersedeSubject = { afterCaptureId: string; source: string } | { rankScanId: string };

/**
 * Phase 3d decision 7: when a diff stage re-runs a subject under a newer stage version, that subject's changes from
 * older versions are superseded and withdrawn from their events, and their open AM reviews are closed as moot
 * (`resolved_by = 'system:superseded'`). Complaint spikes (`details.theme`, written by the
 * nightly review-insights run against a reviews capture) are not diff output and are never touched.
 */
export async function supersedePriorChanges(tx: Tx, subject: SupersedeSubject, version: number): Promise<{ superseded: number; retracted: number }> {
  const scope =
    'rankScanId' in subject
      ? eq(detectedChange.rankScanId, subject.rankScanId)
      : and(eq(detectedChange.afterCaptureId, subject.afterCaptureId), eq(detectedChange.source, subject.source), sql`NOT (${detectedChange.details} ? 'theme')`);
  const old = await tx
    .update(detectedChange)
    .set({ status: 'superseded' })
    .where(and(scope, lt(detectedChange.stageVersion, version), ne(detectedChange.status, 'superseded')))
    .returning({ id: detectedChange.id });
  let retracted = 0;
  for (const { id } of old) if ((await detachChange(tx, id, 'superseded'))?.retracted) retracted++;
  if (old.length > 0) {
    await tx
      .update(decisionReview)
      .set({ resolvedAt: new Date(), resolvedBy: 'system:superseded', resolution: { superseded: true } })
      .where(and(eq(decisionReview.subjectType, 'detected_change'), inArray(decisionReview.subjectId, old.map((o) => o.id)), isNull(decisionReview.resolvedAt)));
  }
  return { superseded: old.length, retracted };
}
