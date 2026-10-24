import { hasFeature, toolkit, ToolError } from '@cs/core';
import { capture, captureBlock, changeEvent, clientCompetitor, competitor, detectedChange, eventChange, eventScore, evidence, trackedPage, withTenant } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { alignBlocks, maskedBlockKeys } from '@cs/engine';
import { and, asc, desc, eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { competitorLinked, SERVABLE_EVIDENCE, snapshotSide } from '../workspace/evidence-access';
import { channelLabel, detailLines, factView } from '../workspace/labels';
import { forChannel } from '../workspace/model-text';
import { clientEvents, eventJoin, firstVisibleEvent, workspaceClient } from '../workspace/scope';
import { type DiffSegment, diffCells, MAX_DIFF_CELLS, wordDiff } from '../workspace/word-diff';
import { CaptureCompareView, CompareView, EvidenceView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export const getEvidence = defineTool({
  name: 'get_evidence',
  access: 'read',
  description: 'One stored piece of evidence (snapshot, text, page HTML or vendor data): when and how it was captured, its SHA-256 hash, and the changes that cite it.',
  input: z.object({ clientId: uuid, evidenceId: uuid }),
  output: EvidenceView,
  permission: 'read', // decision 2: no dashboard flag — brief/alert chips must work for briefs-only clients
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, { clientId, evidenceId }, deps, meta) {
    const c = await workspaceClient(deps, ctx, clientId);
    const [row] = await deps.service
      .select({ id: evidence.id, kind: evidence.kind, sha256: evidence.sha256, bytes: evidence.bytes, contentType: evidence.contentType, captureId: capture.id,
        capturedAt: capture.capturedAt, status: capture.status, source: capture.source, url: capture.url, collectorVersion: capture.collectorVersion, legalHold: capture.legalHold,
        competitorId: capture.competitorId, competitorName: competitor.name })
      .from(evidence).innerJoin(capture, eq(capture.id, evidence.captureId)).innerJoin(competitor, eq(competitor.id, capture.competitorId))
      .where(eq(evidence.id, evidenceId));
    if (!row || !(await competitorLinked(deps, ctx, c.id, row.competitorId))) throw new ToolError('not_found', 'Evidence not found');
    // Decision 7: "part of these changes" only for users with `dashboard`, through decision 3's rule, and only live changes.
    const cited = !hasFeature(ctx, 'dashboard') ? [] : await withTenant(deps.app, ctx, (tx) =>
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
      citedBy: cited.map((e) => ({ eventId: e.eventId, summary: forChannel(meta, e.summary, [row.competitorName]), typeLabel: changeTypeLabel(e.changeType), occurredAt: e.occurredAt.toISOString() })),
    };
  },
});

export const compareSnapshots = defineTool({
  name: 'compare_snapshots',
  access: 'read',
  description: 'Before/after of one detected change: both page snapshots (or the latest earlier one), their hashes, and a word-level text diff.',
  input: z.object({ clientId: uuid, changeId: uuid }),
  output: CompareView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, { clientId, changeId }, deps, meta) {
    const c = await workspaceClient(deps, ctx, clientId);
    const [ch] = await deps.service
      .select({ id: detectedChange.id, competitorName: competitor.name, source: detectedChange.source, kind: detectedChange.kind, pageUrl: trackedPage.url,
        beforeCaptureId: detectedChange.beforeCaptureId, afterCaptureId: detectedChange.afterCaptureId, beforeText: detectedChange.beforeText, afterText: detectedChange.afterText,
        numericChanges: detectedChange.numericChanges, details: detectedChange.details })
      .from(detectedChange).innerJoin(competitor, eq(competitor.id, detectedChange.competitorId)).leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
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
      diff: hasText ? wordDiff(forChannel(meta, ch.beforeText ?? '', [ch.competitorName]), forChannel(meta, ch.afterText ?? '', [ch.competitorName])) : [],
      facts: (ch.numericChanges ?? []).map(factView), details: detailLines(ch.details),
    };
  },
});

/** Most blocks one whole-page comparison returns (the rest are dropped and `truncated` is set). */
export const MAX_COMPARE_BLOCKS = 600;

/** The block columns a comparison needs (not the 512-dim `embedding`); ordered like the engine's `loadBlocks`. */
const loadCompareBlocks = (deps: ToolDeps, captureId: string) =>
  deps.service.select({ ord: captureBlock.ord, path: captureBlock.path, blockKey: captureBlock.blockKey, text: captureBlock.text }).from(captureBlock)
    .where(eq(captureBlock.captureId, captureId)).orderBy(asc(captureBlock.ord));

export const compareCaptures = defineTool({
  name: 'compare_captures',
  access: 'read',
  permission: 'read',
  description: 'The whole stored page of one web capture compared with the previous successful capture of the same page, block by block, with a word-level diff of changed blocks.',
  input: z.object({ clientId: uuid, captureId: uuid }),
  output: CaptureCompareView,
  // Web-only (no channels): block text is shown as stored (P9). Read-only: never extracts blocks (no ensureBlocks).
  async handler(ctx, { clientId, captureId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const [cap] = await deps.service.select({ id: capture.id, competitorId: capture.competitorId, trackedPageId: capture.trackedPageId, source: capture.source,
      status: capture.status, capturedAt: capture.capturedAt, url: capture.url }).from(capture).where(eq(capture.id, captureId));
    if (!cap || !(await competitorLinked(deps, ctx, c.id, cap.competitorId))) throw new ToolError('not_found', 'Capture not found');
    const after = { captureId: cap.id, capturedAt: cap.capturedAt.toISOString() };
    const empty = (state: 'first' | 'no_blocks' | 'not_web', before: { captureId: string; capturedAt: string } | null = null) =>
      ({ state, before, after, pageUrl: cap.url ?? null, blocks: [], truncated: false, blocksCapped: false, maskedCount: 0 });
    if (cap.source !== 'web' || !cap.trackedPageId) return empty('not_web');
    const [prev] = await deps.service.select({ id: capture.id, capturedAt: capture.capturedAt }).from(capture)
      .where(and(eq(capture.trackedPageId, cap.trackedPageId), eq(capture.source, 'web'), eq(capture.status, 'ok'), lt(capture.capturedAt, cap.capturedAt)))
      .orderBy(desc(capture.capturedAt), desc(capture.id)).limit(1);
    const [afterBlocks, beforeBlocks, masked] = await Promise.all([loadCompareBlocks(deps, cap.id), prev ? loadCompareBlocks(deps, prev.id) : [], maskedBlockKeys(deps.service, cap.trackedPageId)]);
    // Order matters: a capture without stored blocks (failed, or never extracted) is no_blocks before it can be first.
    if (cap.status !== 'ok' || afterBlocks.length === 0) return empty('no_blocks', prev ? { captureId: prev.id, capturedAt: prev.capturedAt.toISOString() } : null);
    if (!prev) return empty('first');
    const before = { captureId: prev.id, capturedAt: prev.capturedAt.toISOString() };
    if (beforeBlocks.length === 0) return empty('no_blocks', before);

    const all = alignBlocks(beforeBlocks, afterBlocks);
    // P11: a masked (volatile) block is left out of the page view and counted.
    const shown = all.filter((a) => !(a.before && masked.has(a.before.blockKey)) && !(a.after && masked.has(a.after.blockKey)));
    const maskedCount = all.length - shown.length;
    const blocksCapped = shown.length > MAX_COMPARE_BLOCKS;
    let truncated = false;
    let spent = 0;
    const blocks = shown.slice(0, MAX_COMPARE_BLOCKS).map((a) => {
      let segments: DiffSegment[];
      if (a.kind === 'unchanged') segments = [{ op: 'equal', text: a.after!.text }];
      else if (a.kind === 'added') segments = [{ op: 'insert', text: a.after!.text }];
      else if (a.kind === 'removed') segments = [{ op: 'delete', text: a.before!.text }];
      else {
        const cells = diffCells(a.before!.text, a.after!.text);
        if (spent + cells <= MAX_DIFF_CELLS) {
          spent += cells;
          segments = wordDiff(a.before!.text, a.after!.text);
        } else {
          truncated = true;
          segments = [{ op: 'delete', text: a.before!.text }, { op: 'insert', text: a.after!.text }];
        }
      }
      return { kind: a.kind, segments };
    });
    return { state: 'ok' as const, before, after, pageUrl: cap.url ?? null, blocks, truncated, blocksCapped, maskedCount };
  },
});

export const evidenceTools = [getEvidence, compareSnapshots, compareCaptures];
