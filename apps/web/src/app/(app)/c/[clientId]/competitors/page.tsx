import { canManageCompetitors, hasFeature, isAgencyRole } from '@cs/core';
import type { ClientProfile, SuggestionView, TrackedCompetitor } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import type { SearchState } from './actions';
import { AddCompetitorForm, SuggestionsPanel, TrackedCompetitorsTable } from './competitor-controls';

export const dynamic = 'force-dynamic';

export default async function CompetitorsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const agency = isAgencyRole(ctx.role);
  const canManage = canManageCompetitors(ctx);
  const [profile, tracked, suggestions, search] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: TrackedCompetitor[]; limit: number }>(ctx, 'list_client_competitors', { clientId }),
    canManage ? callTool<{ items: SuggestionView[] }>(ctx, 'list_competitor_suggestions', { clientId }) : Promise.resolve({ items: [] as SuggestionView[] }),
    agency ? callTool<{ state: SearchState }>(ctx, 'get_competitor_search_status', { clientId }) : Promise.resolve({ state: 'idle' as SearchState }),
  ]);
  const atLimit = tracked.items.length >= tracked.limit;
  return (
    <>
      {profile.status === 'prospect' && (
        <Link href={`/agency/prospects/${clientId}`} className="text-sm font-semibold text-primary-soft-text">
          ← Back to the prospect
        </Link>
      )}
      <h1 className="text-[26px] font-extrabold tracking-tight">Competitors — {profile.name}</h1>
      <p className="text-muted-foreground">
        {agency ? `Track 3–5 direct competitors (${tracked.items.length} of ${tracked.limit}).` : `The businesses we monitor for you (${tracked.items.length} of ${tracked.limit}).`}
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Tracked competitors</CardTitle>
        </CardHeader>
        <CardContent>
          <TrackedCompetitorsTable clientId={clientId} items={tracked.items} canRemove={canManage} />
          {canManage && (
            <div className="mt-5 border-t border-line pt-5">
              <AddCompetitorForm clientId={clientId} atLimit={atLimit} limit={tracked.limit} />
            </div>
          )}
        </CardContent>
      </Card>
      {canManage && (
        <SuggestionsPanel
          clientId={clientId}
          ready={profile.keywords.length > 0 && profile.serviceArea !== null}
          suggestions={suggestions.items}
          initialSearch={search.state}
          atLimit={atLimit}
          limit={tracked.limit}
          canSearch={agency}
        />
      )}
    </>
  );
}
