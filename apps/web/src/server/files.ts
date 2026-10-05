import { isAbsolute, resolve } from 'node:path';
import { type AccessContext, isUuid, ToolError, type ToolRegistry } from '@cs/core';
import { brief, type Db, trendReport } from '@cs/db';
import { createStoreFromEnv, type ObjectStore } from '@cs/storage';
import type { BriefDetail, ReportDetail, ToolDeps } from '@cs/tools';
import { eq } from 'drizzle-orm';

export type Enqueue = (job: 'brief-pdf' | 'report-pdf', payload: { briefId: string } | { reportId: string }, singletonKey: string) => Promise<void>;

/** Decision 8: web and worker must share one evidence/pdf directory — a relative `EVIDENCE_FS_DIR` resolves against `apps/worker`, not `apps/web`. */
export function resolveEvidenceDir(dir: string | undefined, webCwd: string): string | undefined {
  if (!dir) return undefined;
  return isAbsolute(dir) ? resolve(dir) : resolve(webCwd, '..', 'worker', dir);
}

let store: ObjectStore | null = null;
export const webStore = (): ObjectStore =>
  (store ??= createStoreFromEnv({ ...process.env, EVIDENCE_FS_DIR: resolveEvidenceDir(process.env.EVIDENCE_FS_DIR, process.cwd()) }));

const notFound = () => new Response('Not found', { status: 404 });
const preparing = () =>
  new Response(
    '<!doctype html><meta charset="utf-8"><title>Preparing PDF</title><body style="font-family:system-ui;padding:40px">Preparing your PDF… this page refreshes automatically.</body>',
    { status: 202, headers: { 'content-type': 'text/html; charset=utf-8', refresh: '5', 'cache-control': 'no-store' } },
  );

interface Located {
  key: string | null;
  filename: string;
}

async function locate(input: Parameters<typeof servePdf>[0]): Promise<Located | null> {
  if (input.kind === 'brief') {
    const b = (await input.registry.invoke(input.ctx, 'get_brief', { briefId: input.id })) as BriefDetail;
    if (b.status !== 'approved' && b.status !== 'sent') return null;
    const [row] = await input.service.select({ key: brief.pdfKey }).from(brief).where(eq(brief.id, input.id));
    return { key: row?.key ?? null, filename: `brief-${b.deliveryDate}.pdf` };
  }
  const r = (await input.registry.invoke(input.ctx, 'get_trend_report', { reportId: input.id })) as ReportDetail;
  if (r.status !== 'sent') return null;
  const [row] = await input.service.select({ key: trendReport.pdfKey }).from(trendReport).where(eq(trendReport.id, input.id));
  return { key: row?.key ?? null, filename: `competitor-trends-${r.quarter}.pdf` };
}

/**
 * Decision 8 + the 4b PDF obligation: stream the stored PDF, or render it on demand.
 *
 * Access is checked through the read tools (`get_brief`/`get_trend_report`) *before* any store read or enqueue —
 * a tenant that cannot see the brief/report in the app gets the same 404 as an unknown id (no existence leak), and
 * a client role that can see it only once it is approved/sent cannot get a PDF of a draft either (the extra status
 * check below also guards agency roles, since the tools let them read drafts the worker never renders a PDF for).
 */
export async function servePdf(input: {
  kind: 'brief' | 'report';
  id: string;
  ctx: AccessContext;
  registry: ToolRegistry<ToolDeps>;
  service: Db;
  store: ObjectStore;
  enqueue: Enqueue;
}): Promise<Response> {
  if (!isUuid(input.id)) return notFound();

  let found: Located | null;
  try {
    found = await locate(input);
  } catch (e) {
    if (e instanceof ToolError && (e.code === 'not_found' || e.code === 'permission_denied' || e.code === 'invalid_input')) return notFound();
    throw e;
  }
  if (!found) return notFound();

  const bytes = found.key ? await input.store.get(found.key) : null;
  if (!bytes) {
    if (input.kind === 'brief') await input.enqueue('brief-pdf', { briefId: input.id }, input.id);
    else await input.enqueue('report-pdf', { reportId: input.id }, input.id);
    return preparing();
  }

  // S9: ObjectStore.get returns Uint8Array<ArrayBufferLike>, which TS 5.9's DOM lib does not accept as BodyInit —
  // re-wrap to a plain Uint8Array.
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${found.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
