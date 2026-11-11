import { hasFeature } from '@cs/core';
import type { CitationAuditView, ClientProfile } from '@cs/tools';
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
import { checkInfo } from './check-info';
import { CheckNowButton } from './check-now-button';
import { ListingsView } from './listings-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Listings' };

const HELP_KEY = 'page:client.listings';
const COPY = PAGE_COPY['client.listings'];

/**
 * 18c-1: where Google search finds the client and its top rivals on the vertical's directories (spec § Listings page).
 * All reads start together in one stage and are awaited before anything renders, so an out-of-scope client is a real 404
 * (a Suspense boundary here would stream the shell first and turn the refusal into HTTP 200).
 */
export default async function ListingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();

  const [profile, audit, guides, tz] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<CitationAuditView>(ctx, 'get_citation_audit', { clientId }),
    helpGuides(ctx, 'client', clientId),
    viewerTimeZone(),
  ]);

  const check = checkInfo(audit.manual, tz);

  return (
    <>
      <PageHeader
        tone="ink"
        title="Listings"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Insights', 'Listings')}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        // The status/error lines under the button are `text-ink`; on the ink band they read white.
        actions={check ? (
          <div className="[&_[role=alert]]:text-[var(--on-ink)] [&_[role=status]]:text-[var(--on-ink)]">
            <CheckNowButton clientId={clientId} check={check} />
          </div>
        ) : undefined}
      />
      <ListingsView audit={audit} tz={tz} />
    </>
  );
}
