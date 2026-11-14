import { client } from '@cs/db';
import { eq } from 'drizzle-orm';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { requestHost } from '@/server/request-host';
import { webStore } from '@/server/store';

export const dynamic = 'force-dynamic';

const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = /^[0-9a-f]{64}\.png$/;

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Phase 16 `GET /files/logo/clients/<clientId>/<sha256>.png` (P11): public (no session; `/files/logo/` is in the proxy's
 * PUBLIC paths) because logos appear in emails and before sign-in, exactly like the agency logo. Only names matching the
 * stored-key shape reach the store; objects are PNGs written by `upload_client_logo`, content-addressed, hence immutable.
 * 13a1 N3: on an agency host the client must belong to that agency (else 404, store untouched); the platform host is unchanged.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string; file: string }> }) {
  const { clientId, file } = await params;
  if (!CLIENT_ID.test(clientId) || !FILE.test(file)) return notFound();
  const env = activeEnvName();
  const host = await requestHost();
  if (host.info.kind === 'agency') {
    const [row] = await dbs(env).service.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, clientId));
    if (row?.agencyId !== host.info.agencyId) return notFound();
  }
  const bytes = await webStore(env).get(`logos/clients/${clientId}/${file}`);
  if (!bytes) return notFound();
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
