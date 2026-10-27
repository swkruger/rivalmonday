import type { PriceMatrixView } from '@cs/tools';
import { StatusChip, Tag } from '@cs/ui';
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
    <section aria-labelledby={headingId} className="rounded-md border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 id={headingId} className="text-sm font-semibold text-ink">{row.name}</h2>
      </div>
      <div className="p-4">
      {row.cells.length === 0 ? (
        <p className="text-sm text-muted-foreground">No prices seen on its website yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
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
                    {s?.offered && <Tag className="ml-2">Your service</Tag>}
                  </span>
                  <span className="font-semibold text-secondary">{cell.prices.map(formatPrice).join(' · ')}</span>
                  {cell.prices.some((p) => p.promo) && <StatusChip tone="warning">Promo</StatusChip>}
                  {change && <span title="Change against 90 days ago" className={`inline-flex h-5 items-center rounded-xs px-1.5 text-xs font-semibold ${CHANGE_TONE[change.tone]}`}><span aria-hidden>{change.text}</span><span className="sr-only">{`${change.tone} ${change.text.slice(2)} since 90 days ago`}</span></span>}
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {children}
      </div>
    </section>
  );
}
