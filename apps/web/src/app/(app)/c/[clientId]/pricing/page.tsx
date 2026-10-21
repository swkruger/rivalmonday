import { hasFeature } from '@cs/core';
import type { ClientProfile, PriceHistoryView, PriceMatrixView } from '@cs/tools';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LineChart } from '@/components/charts/line-chart';
import { clientCrumbs } from '@/components/client-crumbs';
import { EmptyState, HelpEmpty } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { helpGuides } from '@/server/help';
import { one, uuidParam } from '@/server/search-params';
import { callTool, tryCallTool } from '@/server/tools';
import { pricingHref } from './format';
import { historySeries } from './history-series';
import { PriceCard } from './price-card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pricing' };

const HELP_KEY = 'page:client.pricing';
const COPY = PAGE_COPY['client.pricing'];

const PERIODS = [90, 180, 365] as const;
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
  const history = selected ? await tryCallTool<PriceHistoryView>(ctx, 'get_price_history', { clientId, serviceId: selected.serviceId, days }) : null;
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
                  <div className="mt-4 border-t border-line pt-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{history ? `${history.serviceName} — price history` : 'Price history'}</h3>
                      <nav aria-label="Period" className="flex gap-3 text-sm">
                        {PERIODS.map((d) => (
                          <Link
                            key={d}
                            href={pricingHref(clientId, { competitor: selected.competitorId, service: selected.serviceId, days: d })}
                            aria-current={d === days ? 'page' : undefined}
                            className={d === days ? 'font-semibold text-ink' : 'text-muted-foreground hover:text-ink'}
                          >
                            {d} days
                          </Link>
                        ))}
                      </nav>
                    </div>
                    {history ? (
                      <LineChart
                        title={`${history.serviceName} price history`}
                        labels={history.labels}
                        series={historySeries(history)}
                        valueLabel="lowest price"
                        formatValue={(v) => `$${Math.round(v).toLocaleString('en-US')}`}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">This price history is no longer available.</p>
                    )}
                  </div>
                )}
              </PriceCard>
            ))}
          </div>
        </>
      )}
    </>
  );
}
