import { type AccessContext, hasChannel } from '@cs/core';
import { displayNameFor } from '@cs/mcp';
import type { AskThreadSummary, AskThreadView, ClientProfile } from '@cs/tools';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AskChat } from '@/components/ask/ask-chat';
import { ThreadDrawer, ThreadList } from '@/components/ask/thread-list';
import { clientCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY, type TipKey } from '@/help/copy';
import { assistantNameForRequest } from '@/server/ask';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { confirmAskAction, deleteAskThreadAction, saveAskRecommendation } from './actions';

/** Both Ask pages share one help key per page (the PageHeader renders here, not in the route files). */
const helpKeyFor = (threadId: string | null) => (threadId ? 'client.ask.thread' : 'client.ask');
const tipsFor = (threadId: string | null): readonly { label: string; tip: TipKey }[] => [
  { label: 'Answers', tip: 'client.ask.answers' },
  ...(threadId ? [] : [{ label: 'Suggestions', tip: 'client.ask.starters' } as const]),
  { label: 'Privacy', tip: 'client.ask.privacy' },
  { label: 'Making changes', tip: 'client.ask.changes' },
];

/** Both Ask pages' tab title, "Ask {assistant}" like the menu item (the request-cached name read the page itself uses). */
export async function askMetadata(): Promise<Metadata> {
  const { ctx } = await requireContext();
  return { title: `Ask ${await assistantNameForRequest(ctx.agencyId)}` };
}

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
  if (viewer.kind === 'support') return supportAskView(clientId, threadId, ctx);
  if (viewer.kind !== 'user' || ctx.userId.startsWith('contact:') || !hasChannel(ctx, 'ask')) notFound();
  const [profile, starters, threads, thread, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ questions: string[]; reviewAllowed: boolean }>(ctx, 'get_ask_starters', { clientId }),
    callTool<{ items: AskThreadSummary[] }>(ctx, 'list_my_ask_threads', { clientId }),
    threadId ? callTool<AskThreadView>(ctx, 'get_my_ask_thread', { threadId }) : Promise.resolve(null),
    helpGuides(ctx, 'client', clientId),
  ]);
  if (thread && thread.clientId !== clientId) notFound();
  const [assistantName, productName] = await Promise.all([assistantNameForRequest(ctx.agencyId), displayNameFor(dbs().service, ctx.agencyId)]);
  const list = { clientId, threads: threads.items, activeId: thread?.id ?? null, deleteAction: deleteAskThreadAction };
  const askTitle = `Ask ${assistantName}`;
  const client = { id: clientId, name: profile.name };

  return (
    <>
      <PageHeader
        title={askTitle}
        breadcrumb={thread ? clientCrumbs(client, { label: askTitle, href: `/c/${clientId}/ask` }, thread.title) : clientCrumbs(client, askTitle)}
        description={<HelpText text={PAGE_COPY[helpKeyFor(threadId)].description} />}
        helpKey={`page:${helpKeyFor(threadId)}`}
        guide={guides.has(`page:${helpKeyFor(threadId)}`)}
        actions={<ThreadDrawer {...list} />}
      />
      <TipRow items={[...tipsFor(threadId)]} />
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

/** Copy (spec 8b § UI) for the Ask module inside a read-only support session. */
export const ASK_PRIVATE_COPY = 'Ask conversations are private to their authors.';

/**
 * Phase 8b: a support viewer sees that the module exists but no conversation. No thread tools are called (they are
 * hidden in a session anyway); the client is still gated by a read tool so a foreign or malformed id is a 404.
 */
async function supportAskView(clientId: string, threadId: string | null, ctx: AccessContext) {
  if (!hasChannel(ctx, 'ask')) notFound();
  const [profile, assistantName, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    assistantNameForRequest(ctx.agencyId),
    helpGuides(ctx, 'client', clientId),
  ]);
  const askTitle = `Ask ${assistantName}`;
  return (
    <>
      <PageHeader
        title={askTitle}
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, askTitle)}
        helpKey={`page:${helpKeyFor(threadId)}`}
        guide={guides.has(`page:${helpKeyFor(threadId)}`)}
      />
      <p className="rounded-[14px] bg-surface p-6 text-muted-foreground shadow-card">{ASK_PRIVATE_COPY}</p>
    </>
  );
}
