import type { ThemeProposalView } from '@cs/tools';
import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { decideThemeAction } from './actions';
import { ThemeQueue } from './theme-queue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Theme proposals' };

/** Non-operators get the tool's permission_denied → 404 (decision 2). */
export default async function ThemeProposalsPage() {
  const { ctx } = await requireOperatorContext();
  const { pending, decided } = await callTool<{ pending: ThemeProposalView[]; decided: ThemeProposalView[] }>(ctx, 'list_theme_proposals', {});
  return (
    <>
      <PageHeader
        title="Theme proposals"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Theme proposals' }]}
        description="New review topics found in reviews that didn’t fit any existing topic. Approved topics are asked for every review analysed from now on."
      />
      <ThemeQueue pending={pending} decided={decided} action={decideThemeAction} />
    </>
  );
}
