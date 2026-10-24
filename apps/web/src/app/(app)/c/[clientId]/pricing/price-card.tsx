import type { PriceMatrixView } from '@cs/tools';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { formatChange, formatPrice } from './format';

type Row = PriceMatrixView['rows'][number];
type Service = PriceMatrixView['services'][number];

const CHANGE_TONE = { down: 'bg-chip-danger-bg text-chip-danger-text', up: 'bg-chip-success-bg text-chip-success-text' } as const;

/** Decision 2: one card per competitor; each priced service is a link that opens its history under the card (`children`). */
export function PriceCard({ row, services, selectedServiceId, hrefFor, children }: {
  row: Row;
  services: Service[];
  selectedServiceId: string | null;
  hrefFor: (serviceId: string) => string;
  children?: React.ReactNode;
}) {
  const byId = new Map(services.map((s) => [s.id, s]));
  const headingId = `price-card-${row.competitorId}`;
  return (
    <section aria-labelledby={headingId} className="rounded-[14px] bg-surface p-6 shadow-card">
      <h2 id={headingId} className="text-lg font-bold text-ink">{row.name}</h2>
      {row.cells.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No prices seen on its website yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {row.cells.map((cell) => {
            const s = byId.get(cell.serviceId);
            const change = formatChange(cell.change);
            const selected = cell.serviceId === selectedServiceId;
            return (
              <li key={cell.serviceId}>
                <Link
                  href={hrefFor(cell.serviceId)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 hover:bg-muted-surface ${selected ? 'bg-primary-soft' : ''}`}
                >
                  <span className="min-w-0 flex-1 font-semibold text-ink">
                    {s?.name ?? cell.serviceId}
                    {s?.offered && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-text">Your service</span>}
                  </span>
                  <span className="font-bold text-secondary">{cell.prices.map(formatPrice).join(' · ')}</span>
                  {cell.prices.some((p) => p.promo) && <span className="rounded-full bg-chip-warning-bg px-2 py-0.5 text-xs font-bold text-accent-text">Promo</span>}
                  {change && <span title="Change against 90 days ago" className={`rounded-full px-2 py-0.5 text-xs font-bold ${CHANGE_TONE[change.tone]}`}><span aria-hidden>{change.text}</span><span className="sr-only">{`${change.tone} ${change.text.slice(2)} since 90 days ago`}</span></span>}
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {children}
    </section>
  );
}
