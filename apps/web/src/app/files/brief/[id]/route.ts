import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { servePdf } from '@/server/files';
import { webStore } from '@/server/store';
import { enqueue } from '@/server/queue';
import { registry } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** `/files/brief/<id>`: streams the stored brief PDF, or enqueues `brief-pdf` and returns a refreshing "preparing" page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'member-less') return new Response('Not found', { status: 404 });
  return servePdf({ kind: 'brief', id, ctx: viewer.ctx, registry: registry(), service: dbs().service, store: webStore(), enqueue });
}
