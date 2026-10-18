import { hasPermission, isAgencyRole } from '@cs/core';
import type { ClientProfile, RecommendationView } from '@cs/tools';
import type { Metadata } from 'next';
import { clientCrumbs } from '@/components/client-crumbs';
import { PageHeader } from '@/components/page-header';
import { RecommendationBoard } from '@/components/recommendation-board';
import { setStatusAction } from './actions';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recommendations' };

export default async function RecommendationsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { viewer, ctx } = await requireContext();
  const [profile, recs] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: RecommendationView[] }>(ctx, 'list_recommendations', { clientId }),
  ]);
  return (
    <>
      <PageHeader
        title="Recommendations"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Act', 'Recommendations')}
        description="Next steps from your weekly briefs and detected competitor moves."
      />
      <RecommendationBoard action={setStatusAction} clientId={clientId} items={recs.items} agency={isAgencyRole(ctx.role)} canEdit={viewer.kind === 'user' && hasPermission(ctx, 'manage')} />
    </>
  );
}
