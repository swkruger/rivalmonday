import { activeEnvName } from '@/server/dev-guard';
import { webStore } from '@/server/store';

export const dynamic = 'force-dynamic';

const AGENCY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = /^[0-9a-f]{64}\.png$/;

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Phase 10 `GET /files/logo/<agencyId>/<sha256>.png`: public (no session; listed in the proxy's PUBLIC paths) because
 * logos appear in emails and before sign-in. Only names matching the stored-key shape reach the store; objects are
 * always PNGs written by `upload_agency_logo` and content-addressed, hence immutable. Anything else is a 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ agencyId: string; file: string }> }) {
  const { agencyId, file } = await params;
  if (!AGENCY_ID.test(agencyId) || !FILE.test(file)) return notFound();
  const bytes = await webStore(activeEnvName()).get(`logos/${agencyId}/${file}`);
  if (!bytes) return notFound();
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
