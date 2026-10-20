import { after } from 'next/server';
import { askDeps, handleAskTurn } from '@/server/ask';
import { getViewerForClient } from '@/server/current-viewer';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Ask a question (6b): an SSE stream of `AskEvent`s. The turn outlives a client disconnect (`after` keeps it alive). */
export async function POST(req: Request): Promise<Response> {
  // The path names no client: resolve the membership under the body's clientId (validated again in handleAskTurn).
  const body: unknown = await req.clone().json().catch(() => null);
  const clientId = body && typeof body === 'object' && typeof (body as { clientId?: unknown }).clientId === 'string' ? (body as { clientId: string }).clientId : null;
  return handleAskTurn(req, { viewer: await getViewerForClient(clientId), deps: () => askDeps(), keepAlive: (turn) => after(() => turn) });
}
