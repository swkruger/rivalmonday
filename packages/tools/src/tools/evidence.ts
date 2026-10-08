import { toolkit, ToolError } from '@cs/core';
import { capture, changeEvent, clientCompetitor, competitor, detectedChange, eventChange, eventScore, evidence, trackedPage, withTenant } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { and, desc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { competitorLinked, SERVABLE_EVIDENCE, snapshotSide } from '../workspace/evidence-access';
import { channelLabel, detailLines, factView } from '../workspace/labels';
import { clientEvents, eventJoin, firstVisibleEvent, workspaceClient } from '../workspace/scope';
import { wordDiff } from '../workspace/word-diff';
import { CompareView, EvidenceView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export const getEvidence = defineTool({
  name: 'get_evidence',
  description: 'One stored piece of evidence (snapshot, text, page HTML or vendor data): when and how it was captured, its SHA-256 hash, and the changes that cite it.',
  input: z.object({ clientId: uuid, evidenceId: uuid }),
  output: EvidenceView,
  permission: 'read', // decision 2: no dashboard flag — brief/alert chips must work for briefs-only clients
  async handler(ctx, { clientId, evidenceId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const [row] = await deps.service
      .select({ id: evidence.id, kind: evidence.kind, sha256: evidence.sha256, bytes: evidence.bytes, contentType: evidence.contentType, captureId: capture.id,
        capturedAt: capture.capturedAt, status: capture.status, source: capture.source, url: capture.url, collectorVersion: capture.collectorVersion, legalHold: capture.legalHold,
        competitorId: capture.competitorId, competitorName: competitor.name })
      .from(evidence).innerJoin(capture, eq(capture.id, evidence.captureId)).innerJoin(competitor, eq(competitor.id, capture.competitorId))
      .where(eq(evidence.id, evidenceId));
    if (!row || !(await competitorLinked(deps, ctx, c.id, row.competitorId))) throw new ToolError('not_found', 'Evidence not found');
    // Decision 7: "part of these changes" only through decision 3's rule, and only live changes.
    const cited = await withTenant(deps.app, ctx, (tx) =>
      tx.selectDistinct({ eventId: changeEvent.id, summary: changeEvent.summary, changeType: changeEvent.changeType, occurredAt: changeEvent.occurredAt })
        .from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
        .innerJoin(eventChange, eq(eventChange.eventId, changeEvent.id)).innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId))
        .where(and(clientEvents(c.id), eq(detectedChange.status, 'event'), or(eq(detectedChange.afterCaptureId, row.captureId), eq(detectedChange.beforeCaptureId, row.captureId))))
        .orderBy(desc(changeEvent.occurredAt), desc(changeEvent.id))
        .limit(20));
    return {
      evidenceId: row.id, kind: row.kind, sha256: row.sha256, bytes: Number(row.bytes), contentType: row.contentType, captureId: row.captureId,
      capturedAt: row.capturedAt.toISOString(), captureStatus: row.status, channel: row.source, channelLabel: channelLabel(row.source), url: row.url ?? null,
      collectorVersion: row.collectorVersion, legalHold: row.legalHold, competitorId: row.competitorId, competitorName: row.competitorName,
      servable: SERVABLE_EVIDENCE.has(row.kind),
      citedBy: cited.map((e) => ({ eventId: e.eventId, summary: e.summary, typeLabel: changeTypeLabel(e.changeType), occurredAt: e.occurredAt.toISOString() })),
    };
  },
});

export const compareSnapshots = defineTool({
  name: 'compare_snapshots',
  description: 'Before/after of one detected change: both page snapshots (or the latest earlier one), their hashes, and a word-level text diff.',
  input: z.object({ clientId: uuid, changeId: uuid }),
  output: CompareView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId, changeId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const [ch] = await deps.service
      .select({ id: detectedChange.id, source: detectedChange.source, kind: detectedChange.kind, pageUrl: trackedPage.url,
        beforeCaptureId: detectedChange.beforeCaptureId, afterCaptureId: detectedChange.afterCaptureId, beforeText: detectedChange.beforeText, afterText: detectedChange.afterText,
        numericChanges: detectedChange.numericChanges, details: detectedChange.details })
      .from(detectedChange).leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
      .where(and(eq(detectedChange.id, changeId), eq(detectedChange.status, 'event')));
    if (!ch) throw new ToolError('not_found', 'Change not found');
    // F8: a change may be linked to several events (merges) — it is visible when any of them is.
    const linked = await deps.service.select({ eventId: eventChange.eventId }).from(eventChange).where(eq(eventChange.changeId, ch.id));
    const eventId = await firstVisibleEvent(deps, ctx, c.id, linked.map((l) => l.eventId));
    if (!eventId) throw new ToolError('not_found', 'Change not found');
    const [before, after] = await Promise.all([snapshotSide(deps.service, ch.beforeCaptureId), snapshotSide(deps.service, ch.afterCaptureId)]);
    const hasText = ch.beforeText !== null || ch.afterText !== null;
    return {
      changeId: ch.id, eventId, channel: ch.source, channelLabel: channelLabel(ch.source), kind: ch.kind, pageUrl: ch.pageUrl ?? null, before, after,
      diff: hasText ? wordDiff(ch.beforeText ?? '', ch.afterText ?? '') : [],
      facts: (ch.numericChanges ?? []).map(factView), details: detailLines(ch.details),
    };
  },
});

export const evidenceTools = [getEvidence, compareSnapshots];
