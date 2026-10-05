import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { servePdf, webStore } from '@/server/files';
import { enqueue } from '@/server/queue';
import { registry } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** `/files/report/<id>`: streams the stored trend-report PDF, or enqueues `report-pdf` and returns a refreshing "preparing" page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'member-less') return new Response('Not found', { status: 404 });
  return servePdf({ kind: 'report', id, ctx: viewer.ctx, registry: registry(), service: dbs().service, store: webStore(), enqueue });
}
