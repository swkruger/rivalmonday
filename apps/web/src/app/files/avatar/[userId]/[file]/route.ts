import { getViewer } from '@/server/current-viewer';
import { activeEnvName } from '@/server/dev-guard';
import { webStore } from '@/server/store';

export const dynamic = 'force-dynamic';

/** Better Auth ids (random alphanumerics, `u1`-style in fixtures): word characters and `-` only, so no `/` or `.`. */
const USER_ID = /^[\w-]{1,64}$/;
const FILE = /^[0-9a-f]{64}\.png$/;

const notFound = () => new Response('Not found', { status: 404 });

/**
 * `GET /files/avatar/<userId>/<sha256>.png`: private. Only the signed-in user themselves (or an operator in a support
 * session, whose own photo it is) can read it; everyone else, guests included, gets a 404. Only names matching the
 * stored-key shape reach the store; objects are content-addressed PNGs, hence immutable.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string; file: string }> }) {
  const { userId, file } = await params;
  if (!USER_ID.test(userId) || !FILE.test(file)) return notFound();
  const viewer = await getViewer();
  if (!viewer || (viewer.kind !== 'user' && viewer.kind !== 'support') || viewer.userId !== userId) return notFound();
  const bytes = await webStore(activeEnvName()).get(`avatars/${userId}/${file}`);
  if (!bytes) return notFound();
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
