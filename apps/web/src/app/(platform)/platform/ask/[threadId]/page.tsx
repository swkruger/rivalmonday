import { getReviewableAskThread } from '@cs/tools';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { isHiddenToolError, toolDeps } from '@/server/tools';

export const dynamic = 'force-dynamic';

const HELP_KEY = 'page:platform.ask.thread';
const COPY = PAGE_COPY['platform.ask.thread'];

/** One read per request (each read is audit-logged), shared by the tab title and the page. */
const loadThread = cache(async (threadId: string) => {
  const { ctx } = await requireOperatorContext();
  try {
    return await getReviewableAskThread(toolDeps(), ctx, threadId);
  } catch (e) {
    if (isHiddenToolError(e)) notFound();
    throw e;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ threadId: string }> }): Promise<Metadata> {
  return { title: (await loadThread((await params).threadId)).title };
}

/** Read-only thread view (6b e6): text only, never HTML. Each view is audit-logged by the service function. */
export default async function PlatformAskThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const thread = await loadThread((await params).threadId);
  const { ctx } = await requireOperatorContext();
  const guides = await helpGuides(ctx, 'platform');
  return (
    <>
      <PageHeader
        title={thread.title}
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Ask reviews', href: '/platform/ask' }, { label: thread.title }]}
        description={
          <>
            {thread.clientName} · {thread.agencyName}. <HelpText text={COPY.description} />
          </>
        }
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Citations and trace', tip: 'platform.ask.thread.trace' },
          { label: 'Message status', tip: 'platform.ask.thread.status' },
        ]}
      />
      <ol className="flex flex-col gap-3">
        {thread.messages.map((m) => (
          <li key={m.id} className="rounded-lg border bg-card p-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{m.role} · {m.status}</div>
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.citations.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Citations:{' '}
                {m.citations.map((c, i) => (
                  <span key={c}>
                    {i > 0 && ', '}
                    {c.startsWith('kb:') ? <Link href={`/platform/knowledge/${c.slice(3)}`} className="text-secondary hover:underline">{c}</Link> : c}
                  </span>
                ))}
              </p>
            )}
            {m.action != null && <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(m.action, null, 2)}</pre>}
            {m.trace != null && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">Trace</summary>
                <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(m.trace, null, 2)}</pre>
              </details>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
