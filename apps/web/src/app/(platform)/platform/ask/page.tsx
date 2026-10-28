import { listReviewableAskThreads } from '@cs/tools';
import { Section, StatusChip } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { formatDateTime } from '@/lib/format';
import { ASK_MESSAGE_STATUS } from '@/lib/labels';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { isHiddenToolError, toolDeps } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ask reviews' };

const HELP_KEY = 'page:platform.ask';
const COPY = PAGE_COPY['platform.ask'];

/** Read-only (6b e6). Non-operators get permission_denied → 404; only clients that allow review are listed. */
export default async function PlatformAskPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { ctx } = await requireOperatorContext();
  const { cursor } = await searchParams;
  const [guides, tz] = await Promise.all([helpGuides(ctx, 'platform'), viewerTimeZone()]);
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
          { label: 'The status chips', tip: 'platform.ask.flags' },
        ]}
      />
      <Section>
      {page.items.length === 0 ? (
        <EmptyState {...COPY.empty.none} guideAnchor="what-this-page-tells-you" />
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {page.items.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <Link href={`/platform/ask/${t.id}`} className="font-semibold text-secondary hover:underline">{t.clientName}</Link>
                <span className="ml-2 text-13 text-muted-ink">{t.agencyName} · {formatDateTime(t.createdAt, { tz, zoneLabel: true })}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.deletedAt && <StatusChip tone="neutral">Deleted by user</StatusChip>}
                {t.flags.removed > 0 && <StatusChip tone="warning">{t.flags.removed} removed</StatusChip>}
                {t.flags.error && <StatusChip tone="danger">{ASK_MESSAGE_STATUS.error.label}</StatusChip>}
                {t.flags.refused && <StatusChip tone="warning">{ASK_MESSAGE_STATUS.refused.label}</StatusChip>}
                {t.flags.quota && <StatusChip tone="info">{ASK_MESSAGE_STATUS.quota.label}</StatusChip>}
              </div>
            </li>
          ))}
        </ul>
      )}
      </Section>
      {page.nextCursor && <Link href={`/platform/ask?cursor=${page.nextCursor}`} className="text-secondary hover:underline">Older threads</Link>}
    </>
  );
}
