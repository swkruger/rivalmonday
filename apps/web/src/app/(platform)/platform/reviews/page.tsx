import type { DecisionReviewView } from '@cs/tools';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { resolveReviewAction } from './actions';
import { ReviewQueue } from './review-queue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Model reviews' };

const HELP_KEY = 'page:platform.reviews';
const COPY = PAGE_COPY['platform.reviews'];

/** Non-operators get the tool's permission_denied → 404 (decision 2). */
export default async function ModelReviewsPage() {
  const { ctx } = await requireOperatorContext();
  const [{ items }, guides] = await Promise.all([callTool<{ items: DecisionReviewView[] }>(ctx, 'list_decision_reviews', {}), helpGuides(ctx, 'platform')]);
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
      <ReviewQueue items={items} action={resolveReviewAction} />
    </>
  );
}
