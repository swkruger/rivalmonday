import { changeTypeOptions, type DecisionReviewView, sourceLabel } from '@cs/tools';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PrevNext } from '@/components/prev-next';
import { formatRelative } from '@/lib/format';
import { sentenceCase } from '@/lib/labels';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { resolveReviewAction } from './actions';
import { ReviewQueue } from './review-queue';

interface Search { cursor?: string | string[] }
const reviewsHref = (cursor: string) => `/platform/reviews?cursor=${encodeURIComponent(cursor)}`;

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Model reviews' };

const HELP_KEY = 'page:platform.reviews';
const COPY = PAGE_COPY['platform.reviews'];

/** Non-operators get the tool's permission_denied → 404 (decision 2). */
export default async function ModelReviewsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.cursor) ? sp.cursor[0] : sp.cursor;
  const cursor = raw?.slice(0, 200) || undefined;
  const { ctx } = await requireOperatorContext();
  const [{ items, nextCursor, prevCursor, total }, guides, tz] = await Promise.all([
    callTool<{ items: DecisionReviewView[]; nextCursor: string | null; prevCursor: string | null; total: number }>(ctx, 'list_decision_reviews', cursor ? { cursor } : {}),
    helpGuides(ctx, 'platform'),
    viewerTimeZone(),
  ]);
  const now = new Date();
  const kinds = new Map(changeTypeOptions().map((o) => [o.id, o.label]));
  const cards = items.map((i) => ({ ...i, sourceText: sourceLabel(i.source), kindText: kinds.get(i.kind) ?? sentenceCase(i.kind), age: formatRelative(i.createdAt, now, { tz }) }));
  return (
    <>
      <PageHeader
        title="Model reviews"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Model reviews' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Why these are here', tip: 'platform.reviews.why' },
          { label: 'How to answer', tip: 'platform.reviews.answer' },
        ]}
      />
      <ReviewQueue items={cards} total={total} offPage={items.length === 0 && (total > 0 || prevCursor !== null)} action={resolveReviewAction} />
      <PrevNext previous={prevCursor ? reviewsHref(prevCursor) : null} next={nextCursor ? reviewsHref(nextCursor) : null} />
    </>
  );
}
