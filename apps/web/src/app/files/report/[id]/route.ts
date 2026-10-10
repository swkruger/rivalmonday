import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { servePdf } from '@/server/files';
import { webStore } from '@/server/store';
import { pdfEnqueueFor } from '@/server/queue';
import { registry } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** `/files/report/<id>`: streams the stored trend-report PDF, or enqueues `report-pdf` and returns a refreshing "preparing" page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Final-review I1: one environment per request — the database, store and queue used here all belong to it, even if the
  // owner switches environment while this request is in flight.
  const env = activeEnvName();
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'member-less') return new Response('Not found', { status: 404 });
  return servePdf({ kind: 'report', id, ctx: viewer.ctx, registry: registry(env), service: dbs(env).service, store: webStore(env), enqueue: pdfEnqueueFor(env) });
}
