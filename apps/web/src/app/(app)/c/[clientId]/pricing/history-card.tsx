import type { PriceHistoryView } from '@cs/tools';
import { segmentedItemClass, segmentedTrackClass } from '@cs/ui';
import Link from 'next/link';
import { LineChart } from '@/components/charts/line-chart';
import { formatMoney } from '@/lib/format';
import { requireContext } from '@/server/current-viewer';
import { tryCallTool } from '@/server/tools';
import { pricingHref } from './format';
import { historySeries } from './history-series';

export const PERIODS = [90, 180, 365] as const;

/** The selected service's price history, with its own read, streamed behind a Suspense boundary (P3). */
export async function PriceHistoryCard({ clientId, competitorId, serviceId, days }: { clientId: string; competitorId: string; serviceId: string; days: number }) {
  const { ctx } = await requireContext();
  // A stale selection (price gone) simply shows no chart.
  const history = await tryCallTool<PriceHistoryView>(ctx, 'get_price_history', { clientId, serviceId, days });
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{history ? `${history.serviceName} — price history` : 'Price history'}</h3>
        <nav aria-label="Period" className={segmentedTrackClass}>
          {PERIODS.map((d) => (
            <Link
              key={d}
              href={pricingHref(clientId, { competitor: competitorId, service: serviceId, days: d })}
              aria-current={d === days ? 'page' : undefined}
              className={segmentedItemClass}
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
          formatValue={(v) => formatMoney(Math.round(v))}
        />
      ) : (
        <p className="text-sm text-muted-ink">This price history is no longer available.</p>
      )}
    </div>
  );
}
