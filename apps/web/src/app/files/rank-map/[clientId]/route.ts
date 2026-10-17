import { agencySuspended } from '@/server/billing-state';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { serveRankMap } from '@/server/files';
import { webStore } from '@/server/store';
import { registry } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** `/files/rank-map/<clientId>`: streams the stored static map for the geogrid, access-checked through `get_geogrid`. */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  // One environment per request for the database and store used here.
  const env = activeEnvName();
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'member-less' || (await agencySuspended(viewer))) return new Response('Not found', { status: 404 });
  return serveRankMap({ clientId, ctx: viewer.ctx, registry: registry(env), service: dbs(env).service, store: webStore(env) });
}
