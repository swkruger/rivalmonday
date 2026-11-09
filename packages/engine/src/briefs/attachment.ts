import { isCurrentPdfKey } from '@cs/core';
import { brief, client } from '@cs/db';
import type { OutgoingAttachment } from '@cs/email';
import { and, eq } from 'drizzle-orm';
import type { NotificationRow } from '../delivery/outbox';
import { briefPdfKey, ensureBriefPdf, type PdfDeps } from './pdf';

/** Postmark allows 10 MB per message in total; leave room for the body. */
export const MAX_ATTACHMENT_BYTES = 9 * 1024 * 1024;
/** After a render throws, renders are skipped (sent without the attachment) for this long: a broken Chromium costs one timeout, not one per recipient. */
export const RENDER_FAILURE_BACKOFF_MS = 10 * 60_000;

/**
 * The weekly report PDF for a brief email, resolved at dispatch (Task 13). Null = send without it (the PDF link stays).
 * Never throws; only a sent weekly brief of this notification's own agency and client, and only that brief's current-version key.
 * The worker builds one resolver per process, so a render failure is remembered with a TTL (`RENDER_FAILURE_BACKOFF_MS`), not per run.
 */
export function briefAttachment(deps: PdfDeps, opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  let renderFailedAt: number | null = null;
  return async (n: NotificationRow): Promise<OutgoingAttachment | null> => {
    try {
      if (n.kind !== 'brief' || n.subjectType !== 'brief' || !n.clientId) return null;
      const [b] = await deps.db.select({ id: brief.id, kind: brief.kind, status: brief.status, deliveryDate: brief.deliveryDate, pdfKey: brief.pdfKey, clientName: client.name })
        .from(brief).innerJoin(client, eq(client.id, brief.clientId))
        .where(and(eq(brief.id, n.subjectId), eq(brief.agencyId, n.agencyId), eq(brief.clientId, n.clientId)));
      if (!b || b.kind === 'starting_point' || b.status !== 'sent') return null;
      let key: string | null;
      if (renderFailedAt !== null && now() - renderFailedAt < RENDER_FAILURE_BACKOFF_MS) {
        // Renderer failed recently (logged once then): reuse a current stored PDF, never start another render.
        if (b.pdfKey === null || !isCurrentPdfKey(b.pdfKey)) return null;
        key = b.pdfKey;
      } else {
        try {
          key = await ensureBriefPdf(deps, b.id);
        } catch (err) {
          renderFailedAt = now();
          console.warn(`[briefs] pdf attach failed: ${b.id}: render failed, renders paused for ${RENDER_FAILURE_BACKOFF_MS / 60_000} min: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        }
      }
      if (key !== briefPdfKey(n.agencyId, b.id)) { console.warn(`[briefs] pdf attach failed: ${b.id}: no current pdf`); return null; } // only this brief's current-version PDF, never another key
      const bytes = await deps.store.get(key);
      if (!bytes || bytes.byteLength > MAX_ATTACHMENT_BYTES) { console.warn(`[briefs] pdf attach failed: ${b.id}: ${bytes ? 'too large' : 'missing'}`); return null; }
      return { name: attachmentName(b.clientName, b.deliveryDate), contentType: 'application/pdf', content: bytes };
    } catch (err) {
      console.warn(`[briefs] pdf attach failed: ${n.subjectId}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };
}

/** The client's name is data: no path separators, control characters or reserved file-name characters. The file never names the platform. */
export const attachmentName = (clientName: string, date: string): string => {
  const safe = clientName.normalize('NFKC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Client';
  return `${safe} weekly report ${date}.pdf`;
};
