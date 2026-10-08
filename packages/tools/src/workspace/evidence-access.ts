import { type AccessContext, isAgencyRole } from '@cs/core';
import { alert, brief, briefItem, capture, clientCompetitor, type Db, evidence, withTenant } from '@cs/db';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import type { SnapshotSide } from '../tools/schemas';

/**
 * Decision 6: the only evidence kinds ever served as files, with the content type they are served as. `html` and
 * `vendor_json` are never served raw (untrusted competitor markup). The single source of truth: `get_evidence`'s
 * `servable` flag is derived from it, and the file route takes its content type from `evidenceContentType`.
 */
export const EVIDENCE_CONTENT_TYPES = { screenshot: 'image/webp', text: 'text/plain; charset=utf-8' } as const;
export type ServableEvidenceKind = keyof typeof EVIDENCE_CONTENT_TYPES;
export const SERVABLE_EVIDENCE: ReadonlySet<string> = new Set<string>(Object.keys(EVIDENCE_CONTENT_TYPES));

/** The content type an evidence kind is served as, or undefined when it is never served (`html`, `vendor_json`, unknown). */
export const evidenceContentType = (kind: string): (typeof EVIDENCE_CONTENT_TYPES)[ServableEvidenceKind] | undefined =>
  Object.hasOwn(EVIDENCE_CONTENT_TYPES, kind) ? EVIDENCE_CONTENT_TYPES[kind as ServableEvidenceKind] : undefined;

/**
 * Decision 7: tracked now, or cited by this client's alert / active brief item — for client roles only a delivered alert
 * or an item of an approved/sent brief counts (the 5a client-facing status rule). Tenant tables, so it runs through RLS.
 */
export async function competitorLinked(deps: ToolDeps, ctx: AccessContext, clientId: string, competitorId: string): Promise<boolean> {
  const agency = isAgencyRole(ctx.role);
  return withTenant(deps.app, ctx, async (tx) => {
    const [t] = await tx.select({ id: clientCompetitor.competitorId }).from(clientCompetitor)
      .where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))).limit(1);
    if (t) return true;
    const [a] = await tx.select({ id: alert.id }).from(alert)
      .where(and(eq(alert.clientId, clientId), eq(alert.competitorId, competitorId), ...(agency ? [] : [eq(alert.status, 'delivered')]))).limit(1);
    if (a) return true;
    const [b] = await tx.select({ id: briefItem.id }).from(briefItem).innerJoin(brief, eq(brief.id, briefItem.briefId))
      .where(and(eq(brief.clientId, clientId), eq(briefItem.competitorId, competitorId), eq(briefItem.status, 'active'),
        ...(agency ? [] : [inArray(brief.status, ['approved', 'sent'])]))).limit(1);
    return !!b;
  });
}

/** Decision 5: the capture's own screenshot, else the newest earlier screenshot of the same tracked page (`fallback`). Call only after access is proved. */
export async function snapshotSide(db: Db, captureId: string | null): Promise<SnapshotSide | null> {
  if (!captureId) return null;
  const [cap] = await db.select().from(capture).where(eq(capture.id, captureId));
  if (!cap) return null;
  const ev = await db.select({ id: evidence.id, kind: evidence.kind, sha256: evidence.sha256 }).from(evidence).where(eq(evidence.captureId, cap.id));
  const own = ev.find((e) => e.kind === 'screenshot');
  let screenshot: SnapshotSide['screenshot'] = own ? { evidenceId: own.id, capturedAt: cap.capturedAt.toISOString(), fallback: false } : null;
  if (!screenshot && cap.trackedPageId) {
    const [prev] = await db.select({ id: evidence.id, capturedAt: capture.capturedAt }).from(evidence).innerJoin(capture, eq(capture.id, evidence.captureId))
      .where(and(eq(capture.trackedPageId, cap.trackedPageId), eq(evidence.kind, 'screenshot'), lt(capture.capturedAt, cap.capturedAt)))
      .orderBy(desc(capture.capturedAt)).limit(1);
    if (prev) screenshot = { evidenceId: prev.id, capturedAt: prev.capturedAt.toISOString(), fallback: true };
  }
  return {
    captureId: cap.id, capturedAt: cap.capturedAt.toISOString(), status: cap.status, screenshot,
    textEvidenceId: ev.find((e) => e.kind === 'text')?.id ?? null,
    hash: ev.find((e) => e.kind === 'html')?.sha256 ?? ev.find((e) => e.kind === 'text')?.sha256 ?? null,
  };
}
