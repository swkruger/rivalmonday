import type { DecisionReviewView } from '@cs/tools';
import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { resolveReviewAction } from './actions';
import { ReviewQueue } from './review-queue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Model reviews' };

/** Non-operators get the tool's permission_denied → 404 (decision 2). */
export default async function ModelReviewsPage() {
  const { ctx } = await requireOperatorContext();
  const { items } = await callTool<{ items: DecisionReviewView[] }>(ctx, 'list_decision_reviews', {});
  return (
    <>
      <PageHeader
        title="Model reviews"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Model reviews' }]}
        description="Decisions the models weren’t sure about. Your answer fixes the event and becomes a gold label."
      />
      <ReviewQueue items={items} action={resolveReviewAction} />
    </>
  );
}
