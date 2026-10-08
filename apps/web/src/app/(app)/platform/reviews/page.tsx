import type { DecisionReviewView } from '@cs/tools';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { resolveReviewAction } from './actions';
import { ReviewQueue } from './review-queue';

export const dynamic = 'force-dynamic';

/** Non-operators get the tool's permission_denied → 404 (decision 2). */
export default async function ModelReviewsPage() {
  const { ctx } = await requireContext();
  const { items } = await callTool<{ items: DecisionReviewView[] }>(ctx, 'list_decision_reviews', {});
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Model reviews</h1>
      <p className="text-muted-foreground">Decisions the models weren’t sure about. Your answer fixes the event and becomes a gold label.</p>
      <ReviewQueue items={items} action={resolveReviewAction} />
    </>
  );
}
