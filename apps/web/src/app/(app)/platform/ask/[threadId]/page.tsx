import { getReviewableAskThread } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { isHiddenToolError, toolDeps } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** Read-only thread view (6b e6): text only, never HTML. Each view is audit-logged by the service function. */
export default async function PlatformAskThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { ctx } = await requireContext();
  const { threadId } = await params;
  let thread: Awaited<ReturnType<typeof getReviewableAskThread>>;
  try {
    thread = await getReviewableAskThread(toolDeps(), ctx, threadId);
  } catch (e) {
    if (isHiddenToolError(e)) notFound();
    throw e;
  }
  return (
    <>
      <Link href="/platform/ask" className="text-sm text-secondary hover:underline">← Ask review</Link>
      <h1 className="text-[26px] font-extrabold tracking-tight">{thread.title}</h1>
      <p className="text-muted-foreground">{thread.clientName} · {thread.agencyName}</p>
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
