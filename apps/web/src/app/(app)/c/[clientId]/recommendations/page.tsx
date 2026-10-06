import { hasPermission, isAgencyRole } from '@cs/core';
import type { ClientProfile, RecommendationView } from '@cs/tools';
import { RecommendationBoard } from '@/components/recommendation-board';
import { setStatusAction } from './actions';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { viewer, ctx } = await requireContext();
  const [profile, recs] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: RecommendationView[] }>(ctx, 'list_recommendations', { clientId }),
  ]);
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Recommendations — {profile.name}</h1>
      <p className="text-muted-foreground">Next steps from your weekly briefs and detected competitor moves.</p>
      <RecommendationBoard action={setStatusAction} clientId={clientId} items={recs.items} agency={isAgencyRole(ctx.role)} canEdit={viewer.kind === 'user' && hasPermission(ctx, 'manage')} />
    </>
  );
}
