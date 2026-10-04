import { brief, type Db } from '@cs/db';
import { type PdfRenderer, renderBriefDocument } from '@cs/email';
import type { ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { briefEmailProps, loadBriefView } from './deliver';

export interface PdfDeps {
  db: Db;
  store: ObjectStore;
  pdf: PdfRenderer;
}
export const briefPdfKey = (agencyId: string, briefId: string) => `briefs/${agencyId}/${briefId}.pdf`;

/** The client's view of an approved or sent brief as a branded PDF (decision 16); linked from the email, not attached. */
export async function renderBriefPdf(deps: PdfDeps, briefId: string): Promise<{ key: string } | { skipped: string }> {
  const v = await loadBriefView(deps.db, briefId);
  if (v.b.status !== 'approved' && v.b.status !== 'sent') return { skipped: `brief is ${v.b.status}` };
  const html = await renderBriefDocument(briefEmailProps(v, { recipientName: null, link: null, pdfLink: null, itemLink: () => null }));
  const bytes = await deps.pdf(html, { title: `${v.clientName} — weekly competitor brief ${v.b.deliveryDate}`, author: v.branding.displayName, subject: 'Weekly competitor brief' }, { allowUrls: v.branding.logoUrl ? [v.branding.logoUrl] : [] });
  const key = briefPdfKey(v.b.agencyId, briefId);
  await deps.store.put(key, bytes, 'application/pdf');
  await deps.db.update(brief).set({ pdfKey: key }).where(eq(brief.id, briefId));
  return { key };
}
