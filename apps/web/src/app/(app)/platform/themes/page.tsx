import type { ThemeProposalView } from '@cs/tools';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { decideThemeAction } from './actions';
import { ThemeQueue } from './theme-queue';

export const dynamic = 'force-dynamic';

/** Non-operators get the tool's permission_denied → 404 (decision 2). */
export default async function ThemeProposalsPage() {
  const { ctx } = await requireContext();
  const { pending, decided } = await callTool<{ pending: ThemeProposalView[]; decided: ThemeProposalView[] }>(ctx, 'list_theme_proposals', {});
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Theme proposals</h1>
      <p className="text-muted-foreground">New review topics found in reviews that didn’t fit any existing topic. Approved topics are asked for every review analysed from now on.</p>
      <ThemeQueue pending={pending} decided={decided} action={decideThemeAction} />
    </>
  );
}
