import type { BriefDetail } from '@cs/tools';
import { Band, Card, CardContent, CardHeader, CardTitle, Section, StatusChip } from '@cs/ui';
import { formatMetric, scorecardModel } from '@cs/engine';
import Link from 'next/link';
import { confidenceLabel } from '@/components/confidence-label';
import { EvidenceChips } from '@/components/evidence-chips';
import { formatDate, formatWeekOf } from '@/lib/format';
import { BRIEF_ITEM_STATUS, BRIEF_STATUS, labelFor } from '@/lib/labels';
import { OpenFirstMoves, Scorecard } from './scorecard';

const fmt = (n: number | null) => formatMetric('rating', n);

/** Quiet weeks' numbers from stored data (the same snapshot the email shows). */
function TrendTable({ trend }: { trend: NonNullable<BriefDetail['trend']> }) {
  return (
    <div className="overflow-x-auto rounded-[10px] bg-muted-surface">
      <table className="w-full min-w-[26rem] text-sm">
        <caption className="px-3 pt-2 text-left text-xs font-semibold text-muted-foreground">Last {trend.windowDays} days</caption>
        <thead>
          <tr className="text-left text-xs font-semibold text-muted-foreground">
            <th scope="col" className="px-3 py-2">Business</th>
            <th scope="col" className="px-3 py-2 text-right">New reviews</th>
            <th scope="col" className="px-3 py-2 text-right">Rating</th>
            <th scope="col" className="px-3 py-2 text-right">Active ads</th>
          </tr>
        </thead>
        <tbody>
          {trend.businesses.map((b) => (
            <tr key={b.competitorId}>
              <td className="px-3 py-2">{b.self ? `${b.name} (you)` : b.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{b.reviews}</td>
              <td className="px-3 py-2 text-right tabular-nums">{`${fmt(b.prevAvgRating)} → ${fmt(b.avgRating)}`}</td>
              <td className="px-3 py-2 text-right tabular-nums">{b.activeAds === null ? '—' : b.activeAds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Item ids are exposed as `#item-<id>` anchors so Task 15's email deep links can scroll straight to one.
 * Client roles never see `upsellTag` (the tool already strips it) or non-active items (dropped/replaced).
 * `archiveHref` (the Overview) adds "Brief archive →"; `titled={false}` (the brief page, whose `PageHeader` names
 * the week) drops the own title. `surface="overview"` (16b, D-26) renders a `Section` with the summary in a canvas
 * `Band`; the default `card` surface keeps the brief page's Card until 16d.
 */
export function BriefView({
  brief,
  agency,
  timezone,
  archiveHref,
  titled = true,
  surface = 'card',
}: {
  brief: BriefDetail;
  agency: boolean;
  timezone: string;
  archiveHref?: string;
  titled?: boolean;
  surface?: 'card' | 'overview';
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
  const rest = (
    <>
      {model && startingPoint && <Scorecard model={model} />}
      {model && !startingPoint && (
        <>
          <h3 className="text-[15px] font-bold">Where you stand</h3>
          <Scorecard model={model} />
          <OpenFirstMoves moves={model.openFirstMoves} />
        </>
      )}
      {items.map((i) => (
        <article
          key={i.id}
          id={`item-${i.id}`}
          className={`rounded-r-[10px] border-l-[3px] bg-muted-surface px-3.5 py-3 ${confidenceLabel(i.confidence).high ? 'border-amber' : 'border-primary'} ${i.status !== 'active' ? 'opacity-60' : ''}`}
        >
          <h3 className="mb-1.5 text-[15px] font-bold">{i.headline}</h3>
          <p className="my-1">
            {i.subject === 'self' ? null : <b>{i.competitorName}: </b>}
            {i.whatChanged}
          </p>
          {i.whyItMatters && <p className="my-1">{i.whyItMatters}</p>}
          {i.recommendedAction && (
            <p className="my-1">
              <b className="text-secondary">Recommended:</b> {i.recommendedAction}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <EvidenceChips clientId={brief.clientId} ids={i.evidenceIds} />
            {agency && i.upsellTag && <span className="rounded-md bg-chip-warning-bg px-2 py-0.5 text-xs font-semibold text-accent-text">Upsell: {i.upsellTag}</span>}
            {agency && i.status !== 'active' && <StatusChip tone={labelFor(BRIEF_ITEM_STATUS, i.status).tone}>{labelFor(BRIEF_ITEM_STATUS, i.status).label}</StatusChip>}
            <span className="ml-auto rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">{confidenceLabel(i.confidence).text}</span>
          </div>
        </article>
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
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        {titled && <CardTitle className="text-[17px]">{title}</CardTitle>}
        {chips}
        {links('ml-auto ')}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="leading-relaxed">{brief.summary}</p>
        {rest}
      </CardContent>
    </Card>
  );
}
