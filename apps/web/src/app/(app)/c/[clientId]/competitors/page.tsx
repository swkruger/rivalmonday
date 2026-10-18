import { canManageCompetitors, hasFeature, isAgencyRole } from '@cs/core';
import type { ClientProfile, CompetitorSignalView, HiddenReason, SuggestionView, TrackedCompetitor } from '@cs/tools';
import { searchDayLabelAt } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clientCrumbs } from '@/components/client-crumbs';
import { PageHeader } from '@/components/page-header';
import { WriteGuard } from '@/components/read-only';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { RUN_STATE } from './search-state';
import { AddCompetitorForm, SuggestionsPanel, TrackedCompetitorsTable } from './competitor-controls';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Competitors' };

export default async function CompetitorsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const agency = isAgencyRole(ctx.role);
  const canManage = canManageCompetitors(ctx);
  const [profile, tracked, suggestions, search, rated] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: TrackedCompetitor[]; limit: number }>(ctx, 'list_client_competitors', { clientId }),
    // 12a: suggestions (with ad-account matches) are agency-only.
    agency
      ? callTool<{ suggestions: SuggestionView[]; hiddenList: { name: string; reason: HiddenReason }[] }>(ctx, 'list_competitor_suggestions', { clientId })
      : Promise.resolve({ suggestions: [] as SuggestionView[], hiddenList: [] as { name: string; reason: HiddenReason }[] }),
    agency
      ? callTool<{ status: string; nextManualSearchAt: string | null }>(ctx, 'get_competitor_search_status', { clientId })
      : Promise.resolve({ status: 'none', nextManualSearchAt: null }),
    // Tier and signals are for every role (no ad-match data in this payload).
    callTool<{ competitors: CompetitorSignalView[] }>(ctx, 'get_competitor_signals', { clientId }),
  ]);
  const atLimit = tracked.items.length >= tracked.limit;
  // One manual search per client-local week: the button names the next allowed day in the client's timezone.
  const nextSearchLabel = search.nextManualSearchAt ? searchDayLabelAt(search.nextManualSearchAt, profile.timezone) : null;
  return (
    <>
      {profile.status === 'prospect' && (
        <Link href={`/agency/prospects/${clientId}`} className="text-sm font-semibold text-primary-soft-text">
          ← Back to the prospect
        </Link>
      )}
      <PageHeader
        title="Competitors"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Insights', 'Competitors')}
        description={agency ? `Track 3–5 direct competitors (${tracked.items.length} of ${tracked.limit}).` : `The businesses we monitor for you (${tracked.items.length} of ${tracked.limit}).`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Tracked competitors</CardTitle>
        </CardHeader>
        <CardContent>
          <TrackedCompetitorsTable clientId={clientId} items={tracked.items} canRemove={canManage} signals={rated.competitors} />
          {canManage && (
            <WriteGuard>
              <div className="mt-5 border-t border-line pt-5">
                <AddCompetitorForm clientId={clientId} atLimit={atLimit} limit={tracked.limit} />
              </div>
            </WriteGuard>
          )}
        </CardContent>
      </Card>
      {agency && (
        <SuggestionsPanel
          clientId={clientId}
          ready={profile.keywords.length > 0 && profile.serviceArea !== null && !!profile.placeId}
          suggestions={suggestions.suggestions}
          initialSearch={RUN_STATE[search.status] ?? 'idle'}
          atLimit={atLimit}
          limit={tracked.limit}
          trackedCount={tracked.items.length}
          hiddenList={suggestions.hiddenList}
          canSearch={agency}
          nextSearchLabel={nextSearchLabel}
        />
      )}
    </>
  );
}
