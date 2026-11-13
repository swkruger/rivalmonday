import { hasFeature } from '@cs/core';
import type { ClientProfile, ListedEventsView } from '@cs/tools';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { EventsView } from './events-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Events' };

const HELP_KEY = 'page:client.events';
const COPY = PAGE_COPY['client.events'];

/**
 * 18d: upcoming events the client and its tracked rivals list, for the next 60 days (spec § Events page). The page always
 * renders for a client the viewer can see (D10); the menu entry is what the shell's events flag gates. All reads start
 * together and are awaited before anything renders, so an out-of-scope client is a real 404 (a Suspense boundary would
 * stream the shell first and turn the refusal into HTTP 200 — same rule as the Listings page).
 */
export default async function EventsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();

  const [profile, view, guides, tz] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<ListedEventsView>(ctx, 'list_listed_events', { clientId }),
    helpGuides(ctx, 'client', clientId),
    viewerTimeZone(),
  ]);

  return (
    <>
      <PageHeader
        tone="ink"
        title="Events"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Insights', 'Events')}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <EventsView events={view.events} tz={tz} />
    </>
  );
}
