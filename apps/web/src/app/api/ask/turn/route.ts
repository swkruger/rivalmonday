import { after } from 'next/server';
import { askDeps, handleAskTurn } from '@/server/ask';
import { getViewer } from '@/server/current-viewer';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** Ask a question (6b): an SSE stream of `AskEvent`s. The turn outlives a client disconnect (`after` keeps it alive). */
export async function POST(req: Request): Promise<Response> {
  return handleAskTurn(req, { viewer: await getViewer(), deps: () => askDeps(), keepAlive: (turn) => after(() => turn) });
}
