import { changeEvent, detectedChange, eventChange, eventScore, moveEvent, type Tx } from '@cs/db';
import { and, eq, isNull, lt, ne, sql } from 'drizzle-orm';

export type RetractionReason = 'superseded' | 'review';

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
  return { eventId: link.eventId, retracted: false };
}

export type SupersedeSubject = { afterCaptureId: string; source: string } | { rankScanId: string };

/**
 * Phase 3d decision 7: when a diff stage re-runs a subject under a newer stage version, that subject's changes from
 * older versions are superseded and withdrawn from their events. Complaint spikes (`details.theme`, written by the
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
  return { superseded: old.length, retracted };
}
