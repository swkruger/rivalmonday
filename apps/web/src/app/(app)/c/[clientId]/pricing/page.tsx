import { hasFeature } from '@cs/core';
import type { ClientProfile, PriceMatrixView } from '@cs/tools';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { clientCrumbs } from '@/components/client-crumbs';
import { EmptyState, HelpEmpty } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { SectionSkeleton } from '@/components/page-skeleton';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { helpGuides } from '@/server/help';
import { one, uuidParam } from '@/server/search-params';
import { callTool } from '@/server/tools';
import { pricingHref } from './format';
import { PERIODS, PriceHistoryCard } from './history-card';
import { PriceCard } from './price-card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pricing' };

const HELP_KEY = 'page:client.pricing';
const COPY = PAGE_COPY['client.pricing'];

type Period = (typeof PERIODS)[number];
const parseDays = (v: string | string[] | undefined): Period => {
  const n = Number(one(v));
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 90;
};

/** Module 4 (decision 2): competitor cards; a selected service's history opens under its card. */
export default async function PricingPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const days = parseDays(sp.days);
  const [profile, matrix, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<PriceMatrixView>(ctx, 'get_price_matrix', { clientId }),
    helpGuides(ctx, 'client', clientId),
  ]);
  const competitor = uuidParam(sp, 'competitor');
  const service = one(sp.service);
  // A stale selection (removed competitor, price gone) simply shows no chart.
  const selected = matrix.rows.some((r) => r.competitorId === competitor && r.cells.some((c) => c.serviceId === service))
    ? { competitorId: competitor!, serviceId: service! }
    : null;
  const anyPrice = matrix.rows.some((r) => r.cells.length > 0);

  return (
    <>
      <PageHeader
        title="Pricing"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Insights', 'Pricing')}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      {matrix.rows.length === 0 ? (
        <>
          {/* By key: only the viewer's variant is in the help payload, so the other never reaches the browser (I1). */}
          <HelpEmpty id="client.pricing.noCompetitorsAgency" />
          <HelpEmpty id="client.pricing.noCompetitorsClient" />
        </>
      ) : (
        <>
          {!anyPrice && (
            <EmptyState
              {...COPY.empty.noPrices}
              action={!webEnv().webMonitoring ? <p className="text-sm text-ink">Website monitoring isn’t switched on yet, so there’s nothing to show.</p> : undefined}
            />
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              Price change
              <HelpTip tip="client.pricing.priceChange" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              Your service
              <HelpTip tip="client.pricing.yourService" />
            </span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {matrix.rows.map((row) => (
              <PriceCard
                key={row.competitorId}
                row={row}
                services={matrix.services}
                selectedServiceId={selected?.competitorId === row.competitorId ? selected.serviceId : null}
                hrefFor={(serviceId) => pricingHref(clientId, { competitor: row.competitorId, service: serviceId, days })}
              >
                {selected?.competitorId === row.competitorId && (
                  <Suspense fallback={<SectionSkeleton />}>
                    <PriceHistoryCard clientId={clientId} competitorId={selected.competitorId} serviceId={selected.serviceId} days={days} />
                  </Suspense>
                )}
              </PriceCard>
            ))}
          </div>
        </>
      )}
    </>
  );
}
