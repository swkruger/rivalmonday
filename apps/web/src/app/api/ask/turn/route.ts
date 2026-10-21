import { after } from 'next/server';
import { askDeps, handleAskTurn } from '@/server/ask';
import { getViewerForClient } from '@/server/current-viewer';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Ask a question (6b): an SSE stream of `AskEvent`s. The turn outlives a client disconnect (`after` keeps it alive). */
export async function POST(req: Request): Promise<Response> {
  // No pre-parse (7a2 §4): handleAskTurn gates with no client hint first, then re-resolves under the parsed clientId.
  return handleAskTurn(req, { viewerFor: getViewerForClient, deps: () => askDeps(), keepAlive: (turn) => after(() => turn) });
}
