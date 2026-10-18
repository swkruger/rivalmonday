import { listReviewableAskThreads } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { isHiddenToolError, toolDeps } from '@/server/tools';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ask reviews' };

/** Read-only (6b e6). Non-operators get permission_denied → 404; only clients that allow review are listed. */
export default async function PlatformAskPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { ctx } = await requireOperatorContext();
  const { cursor } = await searchParams;
  let page: Awaited<ReturnType<typeof listReviewableAskThreads>>;
  try {
    page = await listReviewableAskThreads(toolDeps(), ctx, { ...(cursor ? { cursor } : {}), limit: 25 });
  } catch (e) {
    if (isHiddenToolError(e)) notFound();
    throw e;
  }
  return (
    <>
      <PageHeader
        title="Ask reviews"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Ask reviews' }]}
        description="Conversations from clients that allow review. Opening one is recorded in the audit log."
      />
      {page.items.length === 0 ? (
        <p className="text-muted-foreground">No threads to review.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {page.items.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <Link href={`/platform/ask/${t.id}`} className="font-semibold text-secondary hover:underline">{t.clientName}</Link>
                <span className="ml-2 text-sm text-muted-foreground">{t.agencyName} · {t.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
              </div>
              <div className="flex gap-1.5 text-xs">
                {t.flags.removed > 0 && <span className="rounded-full bg-muted px-2 py-0.5">{t.flags.removed} removed</span>}
                {t.flags.error && <span className="rounded-full bg-muted px-2 py-0.5">error</span>}
                {t.flags.refused && <span className="rounded-full bg-muted px-2 py-0.5">refused</span>}
                {t.flags.quota && <span className="rounded-full bg-muted px-2 py-0.5">quota</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor && <Link href={`/platform/ask?cursor=${page.nextCursor}`} className="text-secondary hover:underline">Older threads</Link>}
    </>
  );
}
