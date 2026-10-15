import type { BriefDetail } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import { formatMetric, scorecardModel } from '@cs/engine';
import { EvidenceChips } from '@/components/evidence-chips';
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
 */
export function BriefView({ brief, agency }: { brief: BriefDetail; agency: boolean }) {
  const items = [...brief.items].filter((i) => agency || i.status === 'active').sort((a, b) => a.ord - b.ord);
  const startingPoint = brief.kind === 'starting_point';
  const model = brief.scorecard ? scorecardModel(brief.scorecard, { clientName: brief.items.find((i) => i.subject === 'self')?.competitorName ?? '' }) : null;
  const deliverable = brief.status === 'approved' || brief.status === 'sent';
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <CardTitle className="text-[17px]">{startingPoint ? 'Your starting point' : `Week of ${brief.deliveryDate}`}</CardTitle>
        {startingPoint && <Badge variant="outline">Starting point · {brief.deliveryDate}</Badge>}
        {agency && <Badge variant="secondary">{brief.status}</Badge>}
        {deliverable && (
          <a href={`/files/brief/${brief.id}`} target="_blank" rel="noopener noreferrer" className="ml-auto font-semibold text-primary-soft-text">
            Download PDF
          </a>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="leading-relaxed">{brief.summary}</p>
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
            className={`rounded-r-[10px] border-l-[3px] bg-muted-surface px-3.5 py-3 ${i.confidence >= 0.85 ? 'border-amber' : 'border-primary'} ${i.status !== 'active' ? 'opacity-60' : ''}`}
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
              {agency && i.upsellTag && <span className="rounded-md bg-[#FFF3DC] px-2 py-0.5 text-xs font-semibold text-accent-text">Upsell: {i.upsellTag}</span>}
              {agency && i.status !== 'active' && <Badge variant="outline">{i.status}</Badge>}
              <span className="ml-auto rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">Confidence {Math.round(i.confidence * 100)}%</span>
            </div>
          </article>
        ))}
        {!startingPoint && brief.trend && <TrendTable trend={brief.trend} />}
      </CardContent>
    </Card>
  );
}
