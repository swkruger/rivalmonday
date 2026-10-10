import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { serveEvidence } from '@/server/files';
import { webStore } from '@/server/store';
import { registry } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** `/files/evidence/<clientId>/<evidenceId>`: streams a screenshot or text evidence file, access-checked through `get_evidence`. */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string; evidenceId: string }> }) {
  const { clientId, evidenceId } = await params;
  // Final-review I1: one environment per request for the database and store used here.
  const env = activeEnvName();
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'member-less') return new Response('Not found', { status: 404 });
  return serveEvidence({ clientId, evidenceId, ctx: viewer.ctx, registry: registry(env), service: dbs(env).service, store: webStore(env) });
}
