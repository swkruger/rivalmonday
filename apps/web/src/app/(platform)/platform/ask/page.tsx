import { listReviewableAskThreads } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { isHiddenToolError, toolDeps } from '@/server/tools';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ask reviews' };

const HELP_KEY = 'page:platform.ask';
const COPY = PAGE_COPY['platform.ask'];

/** Read-only (6b e6). Non-operators get permission_denied → 404; only clients that allow review are listed. */
export default async function PlatformAskPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { ctx } = await requireOperatorContext();
  const { cursor } = await searchParams;
  const guides = await helpGuides(ctx, 'platform');
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
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Which conversations', tip: 'platform.ask.allowed' },
          { label: 'What is recorded', tip: 'platform.ask.audit' },
          { label: 'The badges', tip: 'platform.ask.flags' },
        ]}
      />
      {page.items.length === 0 ? (
        <EmptyState {...COPY.empty.none} guideAnchor="what-this-page-tells-you" />
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
