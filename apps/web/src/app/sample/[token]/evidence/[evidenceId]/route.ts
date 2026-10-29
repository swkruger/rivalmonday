import { evidenceContentType, sampleEvidenceKey } from '@cs/tools';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';
import { webStore } from '@/server/store';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Phase 17a: one evidence file of a public sample brief (`/sample/<token>/evidence/<id>`). Only a screenshot or text cited by
 * an active item of the link's starting point is served (`sampleEvidenceKey`); every other case is the same 404. Mirrors
 * `serveEvidence` (`server/files.ts`); the token in the URL is never cached, logged or sent on as a referrer.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; evidenceId: string }> }) {
  const { token, evidenceId } = await params;
  const env = activeEnvName(); // one environment per request for the database and the store
  const found = await sampleEvidenceKey(dbs(env).service, token, webEnv().authSecret, evidenceId, new Date());
  const type = found ? evidenceContentType(found.kind) : undefined;
  if (!found || !type) return notFound();
  const bytes = await webStore(env).get(found.objectKey);
  if (!bytes) return notFound();
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': type,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
      'content-disposition': 'inline',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
