import type { PriceMatrixView } from '@cs/tools';
import { StatusChip, Tag } from '@cs/ui';
import { ChevronRight, ExternalLink, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { formatChange, formatPrice } from './format';

type Row = PriceMatrixView['rows'][number];
type Service = PriceMatrixView['services'][number];

const CHANGE_TONE = { down: 'bg-chip-danger-bg text-chip-danger-text', up: 'bg-chip-success-bg text-chip-success-text' } as const;

/** Decision 2: one card per competitor; each priced service is a link that opens its history under the card (`children`).
 *  An ad-image price also gets a sibling link to its stored image (no evidence, no claim; never nested in the row link). */
export function PriceCard({ row, services, selectedServiceId, hrefFor, evidenceHref, children }: {
  row: Row;
  services: Service[];
  selectedServiceId: string | null;
  hrefFor: (serviceId: string) => string;
  evidenceHref?: (evidenceId: string) => string;
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
        <p className="text-sm text-muted-ink">No prices seen on its website yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {row.cells.map((cell) => {
            const s = byId.get(cell.serviceId);
            const change = formatChange(cell.change);
            const selected = cell.serviceId === selectedServiceId;
            const imageEvidenceId = cell.prices.find((p) => p.source === 'ad_image' && p.evidenceIds.length > 0)?.evidenceIds[0];
            const postUrl = cell.prices.find((p) => p.source === 'gbp_post' && p.postUrl)?.postUrl ?? null;
            const serviceName = s?.name ?? cell.serviceId;
            return (
              <li key={cell.serviceId} className="flex items-center gap-1">
                <Link
                  href={hrefFor(cell.serviceId)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 hover:bg-muted-surface ${selected ? 'bg-primary-soft' : ''}`}
                >
                  <span className="min-w-0 flex-1 font-semibold text-ink">
                    {serviceName}
                    {s?.offered && <Tag className="ml-2 whitespace-nowrap">Your service</Tag>}
                  </span>
                  <span className="font-semibold text-secondary">
                    {cell.prices.map((p, i) => (
                      <span key={i}>
                        {i > 0 && ' · '}
                        {formatPrice(p)}
                        {/* Ad-sourced prices are shown but never counted in the change (18a-1 O6). */}
                        {p.source === 'meta_ad' && <Tag className="ml-1 whitespace-nowrap">From an ad</Tag>}
                        {p.source === 'ad_image' && <Tag className="ml-1 whitespace-nowrap">From an ad image</Tag>}
                        {p.source === 'gbp_post' && <Tag className="ml-1 whitespace-nowrap">From a Google post</Tag>}
                      </span>
                    ))}
                  </span>
                  {cell.prices.some((p) => p.promo) && <StatusChip tone="warning">Promo</StatusChip>}
                  {change && <span title="Change against 90 days ago" className={`inline-flex h-5 items-center rounded-xs px-1.5 text-xs font-semibold ${CHANGE_TONE[change.tone]}`}><span aria-hidden>{change.text}</span><span className="sr-only">{`${change.tone} ${change.text.slice(2)} since 90 days ago`}</span></span>}
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-ink" />
                </Link>
                {postUrl && (
                  <a
                    href={postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open the Google post for ${serviceName}`}
                    title="Open the Google post"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-secondary hover:bg-muted-surface"
                  >
                    <ExternalLink aria-hidden className="size-4" />
                  </a>
                )}
                {imageEvidenceId && evidenceHref && (
                  <Link
                    href={evidenceHref(imageEvidenceId)}
                    aria-label={`Open the ad image for ${serviceName}`}
                    title="Open the ad image"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-secondary hover:bg-muted-surface"
                  >
                    <ImageIcon aria-hidden className="size-4" />
                  </Link>
                )}
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
