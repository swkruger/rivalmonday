import { hasFeature } from '@cs/core';
import { productNameFor } from '@cs/mcp';
import type { AskThreadSummary, AskThreadView } from '@cs/tools';
import { FridayBadge } from '@cs/ui';
import { notFound } from 'next/navigation';
import { AskChat } from '@/components/ask/ask-chat';
import { ThreadDrawer, ThreadList } from '@/components/ask/thread-list';
import { assistantNameFor } from '@/server/ask';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { callTool } from '@/server/tools';
import { confirmAskAction, deleteAskThreadAction, saveAskRecommendation } from './actions';

/**
 * `/c/[clientId]/ask` and `/ask/[threadId]` (spec "Web"). Guests and clients without the `ask` feature get a 404 (Q2);
 * every read is a registered tool (Q13), so a foreign/missing thread or an out-of-scope client is a 404 too.
 * Nothing here reads usage or quota (e4).
 */
export async function AskScreen({ clientId, threadId, initialQuestion, autoSend, seedEvidenceId }: {
  clientId: string;
  threadId: string | null;
  initialQuestion?: string;
  autoSend?: boolean;
  seedEvidenceId?: string;
}) {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || ctx.userId.startsWith('contact:') || !hasFeature(ctx, 'ask')) notFound();
  const [starters, threads, thread] = await Promise.all([
    callTool<{ questions: string[]; reviewAllowed: boolean }>(ctx, 'get_ask_starters', { clientId }),
    callTool<{ items: AskThreadSummary[] }>(ctx, 'list_my_ask_threads', { clientId }),
    threadId ? callTool<AskThreadView>(ctx, 'get_my_ask_thread', { threadId }) : Promise.resolve(null),
  ]);
  if (thread && thread.clientId !== clientId) notFound();
  const { service } = dbs();
  const [assistantName, productName] = await Promise.all([assistantNameFor(service, ctx.agencyId), productNameFor(service, ctx.agencyId)]);
  const list = { clientId, threads: threads.items, activeId: thread?.id ?? null, deleteAction: deleteAskThreadAction };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-tight">
            Ask <FridayBadge name={assistantName} />
          </h1>
          <p className="truncate text-muted-foreground">{thread ? thread.title : 'Questions about your competitors and market, answered from the monitored evidence.'}</p>
        </div>
        <ThreadDrawer {...list} />
      </div>
      <div className="flex items-start gap-5">
        <aside className="hidden w-64 flex-shrink-0 rounded-[14px] bg-surface p-3 shadow-card lg:sticky lg:top-6 lg:block">
          <ThreadList {...list} />
        </aside>
        <AskChat
          key={thread?.id ?? 'new'}
          clientId={clientId}
          threadId={thread?.id ?? null}
          assistantName={assistantName}
          productName={productName}
          reviewAllowed={starters.reviewAllowed}
          messages={thread?.messages ?? []}
          starters={starters.questions}
          confirmAction={confirmAskAction}
          saveAction={saveAskRecommendation}
          {...(initialQuestion ? { initialQuestion } : {})}
          {...(autoSend ? { autoSend } : {})}
          {...(seedEvidenceId ? { seedEvidenceId } : {})}
        />
      </div>
    </>
  );
}
