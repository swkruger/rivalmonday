import { isAgencyRole } from '@cs/core';
import type { ClientProfile, SuggestionView, TrackedCompetitor } from '@cs/tools';
import { COMPETITOR_LIMIT } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import type { SearchState } from './actions';
import { AddCompetitorForm, SuggestionsPanel, TrackedCompetitorsTable } from './competitor-controls';

export const dynamic = 'force-dynamic';

export default async function CompetitorsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [profile, tracked, suggestions, search] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: TrackedCompetitor[] }>(ctx, 'list_client_competitors', { clientId }),
    callTool<{ items: SuggestionView[] }>(ctx, 'list_competitor_suggestions', { clientId }),
    callTool<{ state: SearchState }>(ctx, 'get_competitor_search_status', { clientId }),
  ]);
  const atLimit = tracked.items.length >= COMPETITOR_LIMIT;
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Competitors — {profile.name}</h1>
      <p className="text-muted-foreground">
        Track 3–5 direct competitors ({tracked.items.length} of {COMPETITOR_LIMIT}).
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Tracked competitors</CardTitle>
        </CardHeader>
        <CardContent>
          <TrackedCompetitorsTable clientId={clientId} items={tracked.items} />
          <div className="mt-5 border-t border-line pt-5">
            <AddCompetitorForm clientId={clientId} atLimit={atLimit} limit={COMPETITOR_LIMIT} />
          </div>
        </CardContent>
      </Card>
      <SuggestionsPanel
        clientId={clientId}
        ready={profile.keywords.length > 0 && profile.serviceArea !== null}
        suggestions={suggestions.items}
        initialSearch={search.state}
        atLimit={atLimit}
        limit={COMPETITOR_LIMIT}
      />
    </>
  );
}
