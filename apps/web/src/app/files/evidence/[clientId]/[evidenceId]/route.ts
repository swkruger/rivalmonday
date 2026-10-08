import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { serveEvidence, webStore } from '@/server/files';
import { registry } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** `/files/evidence/<clientId>/<evidenceId>`: streams a screenshot or text evidence file, access-checked through `get_evidence`. */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string; evidenceId: string }> }) {
  const { clientId, evidenceId } = await params;
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'member-less') return new Response('Not found', { status: 404 });
  return serveEvidence({ clientId, evidenceId, ctx: viewer.ctx, registry: registry(), service: dbs().service, store: webStore() });
}
