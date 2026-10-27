import type { BriefDetail } from '@cs/tools';
import { Band, Section, StatusChip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag } from '@cs/ui';
import { formatMetric, scorecardModel } from '@cs/engine';
import Link from 'next/link';
import { confidenceLabel } from '@/components/confidence-label';
import { EvidenceChips } from '@/components/evidence-chips';
import type { EvidenceRefs } from '@/server/evidence-refs';
import { formatDate, formatWeekOf } from '@/lib/format';
import { BRIEF_ITEM_STATUS, BRIEF_STATUS, labelFor } from '@/lib/labels';
import { OpenFirstMoves, Scorecard } from './scorecard';

const fmt = (n: number | null) => formatMetric('rating', n);

/** Quiet weeks' numbers from stored data (the same snapshot the email shows). */
function TrendTable({ trend }: { trend: NonNullable<BriefDetail['trend']> }) {
  return (
    <Table>
      <caption className="pb-2 text-left text-xs font-semibold text-muted-ink">Last {trend.windowDays} days</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Business</TableHead>
          <TableHead scope="col" numeric>New reviews</TableHead>
          <TableHead scope="col" numeric>Rating</TableHead>
          <TableHead scope="col" numeric>Active ads</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trend.businesses.map((b) => (
          <TableRow key={b.competitorId}>
            <TableCell>{b.self ? `${b.name} (you)` : b.name}</TableCell>
            <TableCell numeric>{b.reviews}</TableCell>
            <TableCell numeric>{`${fmt(b.prevAvgRating)} → ${fmt(b.avgRating)}`}</TableCell>
            <TableCell numeric>{b.activeAds === null ? '—' : b.activeAds}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Item ids are exposed as `#item-<id>` anchors so Task 15's email deep links can scroll straight to one.
 * Client roles never see `upsellTag` (the tool already strips it) or non-active items (dropped/replaced).
 * `archiveHref` (the Overview) adds "Brief archive →"; `titled={false}` (the brief page, whose `PageHeader` names
 * the week) drops the own title. `surface="overview"` (16b, D-26) renders a `Section` with the summary in a canvas
 * `Band`; the default `reading` surface (16d, design system 09 § 5.5) is the 680 px column of the brief page.
 */
export function BriefView({
  brief,
  agency,
  timezone,
  archiveHref,
  titled = true,
  surface = 'reading',
  refs,
}: {
  brief: BriefDetail;
  agency: boolean;
  timezone: string;
  archiveHref?: string;
  titled?: boolean;
  surface?: 'reading' | 'overview';
  refs?: EvidenceRefs;
}) {
  const items = [...brief.items].filter((i) => agency || i.status === 'active').sort((a, b) => a.ord - b.ord);
  const startingPoint = brief.kind === 'starting_point';
  const model = brief.scorecard ? scorecardModel(brief.scorecard, { clientName: brief.items.find((i) => i.subject === 'self')?.competitorName ?? '' }) : null;
  const deliverable = brief.status === 'approved' || brief.status === 'sent';
  const title = startingPoint ? 'Your starting point' : formatWeekOf(brief.deliveryDate, { tz: 'UTC' });
  const chips = (
    <>
      {startingPoint && <StatusChip tone="info">Starting point · {formatDate(brief.deliveryDate, { tz: 'UTC' })}</StatusChip>}
      {agency && <StatusChip tone={labelFor(BRIEF_STATUS, brief.status).tone}>{labelFor(BRIEF_STATUS, brief.status).label}</StatusChip>}
    </>
  );
  const links = (extra: string) => (deliverable || archiveHref) && (
    <span className={`${extra}flex flex-wrap items-center gap-4`}>
      {deliverable && (
        <a href={`/files/brief/${brief.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-soft-text">
          Download PDF
        </a>
      )}
      {archiveHref && (
        <Link href={archiveHref} className="font-semibold text-primary-soft-text">
          Brief archive →
        </Link>
      )}
    </span>
  );
  const reading = surface === 'reading';
  const H = reading ? 'h2' : 'h3';
  const rest = (
    <>
      {model && startingPoint && <Scorecard model={model} />}
      {model && !startingPoint && (
        <>
          <H className={reading ? 'text-lg font-semibold' : 'text-base font-semibold'}>Where you stand</H>
          <Scorecard model={model} />
          <OpenFirstMoves moves={model.openFirstMoves} />
        </>
      )}
      {items.map((i) => (
        <section
          key={i.id}
          id={`item-${i.id}`}
          data-slot="brief-item"
          className={`border-t border-line first:border-t-0 ${reading ? 'py-6' : 'py-4'} ${i.status !== 'active' ? 'opacity-60' : ''}`}
        >
          <H className={`mb-2 ${reading ? 'text-lg' : 'text-base'} font-semibold`}>{i.headline}</H>
          <p className="my-1">
            {i.subject === 'self' ? null : <b>{i.competitorName}: </b>}
            {i.whatChanged}
          </p>
          {i.whyItMatters && (
            <Band tone="muted" className="my-3 text-sm">
              {i.whyItMatters}
            </Band>
          )}
          {i.recommendedAction && (
            <p className="my-1">
              <b className="font-semibold text-ink">Recommended:</b> {i.recommendedAction}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <EvidenceChips clientId={brief.clientId} ids={i.evidenceIds} refs={refs} />
            {agency && i.upsellTag && <StatusChip tone="warning">Upsell: {i.upsellTag}</StatusChip>}
            {agency && i.status !== 'active' && <StatusChip tone={labelFor(BRIEF_ITEM_STATUS, i.status).tone}>{labelFor(BRIEF_ITEM_STATUS, i.status).label}</StatusChip>}
            <Tag className="ml-auto">{confidenceLabel(i.confidence).text}</Tag>
          </div>
        </section>
      ))}
      {!startingPoint && brief.trend && <TrendTable trend={brief.trend} />}
    </>
  );
  if (surface === 'overview') {
    return (
      <Section
        title={titled ? title : undefined}
        actions={
          <span className="flex flex-wrap items-center justify-end gap-3">
            {chips}
            {links('')}
          </span>
        }
      >
        <Band tone="canvas">
          <p className="leading-relaxed">{brief.summary}</p>
        </Band>
        <div className="flex flex-col gap-3">{rest}</div>
      </Section>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
      {(titled || deliverable || archiveHref || startingPoint || agency) && (
        <div className="flex flex-wrap items-center gap-3">
          {titled && <h2 className="text-3xl font-semibold tracking-tight text-ink">{title}</h2>}
          {chips}
          {links('ml-auto ')}
        </div>
      )}
      <p className="text-base leading-relaxed">{brief.summary}</p>
      {rest}
    </div>
  );
}
