import { createHash } from 'node:crypto';
import { capture, evidence } from '@cs/db';
import sharp from 'sharp';
import type { SeedContext } from './context';
import { DEMO_COLLECTOR } from './tenancy';

export type EvidenceKind = 'html' | 'text' | 'screenshot' | 'vendor_json';
const FILE: Record<EvidenceKind, string> = { html: 'page.html', text: 'text.txt', screenshot: 'screenshot.webp', vendor_json: 'vendor.json' };

/** Writes the file to the environment's evidence store and its `evidence` row (real sha256 and size). */
export async function putEvidence(ctx: SeedContext, o: { captureId: string; competitorId: string; kind: EvidenceKind; body: Uint8Array; contentType: string }): Promise<string> {
  const objectKey = `evidence/${o.competitorId}/${o.captureId}/${FILE[o.kind]}`;
  await ctx.store.put(objectKey, o.body, o.contentType);
  const [row] = await ctx.db.insert(evidence).values({
    captureId: o.captureId, kind: o.kind, objectKey, sha256: createHash('sha256').update(o.body).digest('hex'), bytes: o.body.byteLength, contentType: o.contentType,
  }).returning({ id: evidence.id });
  return row!.id;
}

/** A simple page mock: a header bar and up to six content blocks; `highlight` outlines the changed block. */
export interface PageMock {
  title: string;
  url: string;
  blocks: string[];
  highlight: number | null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function pageMockSvg(m: PageMock): string {
  const blocks = m.blocks.slice(0, 6).map((text, i) => {
    const y = 96 + i * 112;
    const hot = m.highlight === i;
    return `<rect x="48" y="${y}" width="1104" height="92" rx="10" fill="#FFFFFF" stroke="${hot ? '#F5A524' : '#DDE3EA'}" stroke-width="${hot ? 5 : 1}"/>`
      + `<text x="76" y="${y + 54}" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#0B2540">${esc(clip(text, 80))}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">`
    + `<rect width="1200" height="800" fill="#F6F9FC"/><rect width="1200" height="64" fill="#0B2540"/>`
    + `<text x="32" y="42" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF">${esc(clip(m.title, 48))}</text>`
    + `<text x="1168" y="40" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#9FB3C8">${esc(clip(m.url, 60))}</text>`
    + blocks.join('') + '</svg>';
}

export async function pageMockWebp(m: PageMock): Promise<Uint8Array> {
  return new Uint8Array(await sharp(Buffer.from(pageMockSvg(m))).webp({ quality: 70 }).toBuffer());
}

export const pageHtml = (m: PageMock): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title)}</title></head><body><main>${m.blocks.map((b) => `<section><p>${esc(b)}</p></section>`).join('')}</main></body></html>`;

export const pageText = (m: PageMock): string => m.blocks.join('\n\n');

/** One ok vendor capture with its stored JSON (spec §4.2 evidence for non-web events). */
export async function vendorCapture(ctx: SeedContext, competitorId: string, source: string, at: Date, payload: Record<string, unknown>): Promise<{ captureId: string; evidenceId: string }> {
  const [c] = await ctx.db.insert(capture).values({ competitorId, source, status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: at }).returning({ id: capture.id });
  const evidenceId = await putEvidence(ctx, {
    captureId: c!.id, competitorId, kind: 'vendor_json', body: new TextEncoder().encode(JSON.stringify(payload, null, 2)), contentType: 'application/json',
  });
  return { captureId: c!.id, evidenceId };
}
