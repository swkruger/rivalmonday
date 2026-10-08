import type { BriefDetail } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import { EvidenceChips } from '@/components/evidence-chips';

/**
 * Item ids are exposed as `#item-<id>` anchors so Task 15's email deep links can scroll straight to one.
 * Client roles never see `upsellTag` (the tool already strips it) or non-active items (dropped/replaced).
 */
export function BriefView({ brief, agency }: { brief: BriefDetail; agency: boolean }) {
  const items = [...brief.items].filter((i) => agency || i.status === 'active').sort((a, b) => a.ord - b.ord);
  const deliverable = brief.status === 'approved' || brief.status === 'sent';
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <CardTitle className="text-[17px]">Week of {brief.deliveryDate}</CardTitle>
        {agency && <Badge variant="secondary">{brief.status}</Badge>}
        {deliverable && (
          <a href={`/files/brief/${brief.id}`} className="ml-auto font-semibold text-primary-soft-text">
            Download PDF
          </a>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="leading-relaxed">{brief.summary}</p>
        {items.map((i) => (
          <article
            key={i.id}
            id={`item-${i.id}`}
            className={`rounded-r-[10px] border-l-[3px] bg-muted-surface px-3.5 py-3 ${i.confidence >= 0.85 ? 'border-amber' : 'border-primary'} ${i.status !== 'active' ? 'opacity-60' : ''}`}
          >
            <h3 className="mb-1.5 text-[15px] font-bold">{i.headline}</h3>
            <p className="my-1">
              <b>{i.competitorName}:</b> {i.whatChanged}
            </p>
            <p className="my-1">{i.whyItMatters}</p>
            <p className="my-1">
              <b className="text-secondary">Recommended:</b> {i.recommendedAction}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <EvidenceChips clientId={brief.clientId} ids={i.evidenceIds} />
              {agency && i.upsellTag && <span className="rounded-md bg-[#FFF3DC] px-2 py-0.5 text-xs font-semibold text-accent-text">Upsell: {i.upsellTag}</span>}
              {agency && i.status !== 'active' && <Badge variant="outline">{i.status}</Badge>}
              <span className="ml-auto rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">Confidence {Math.round(i.confidence * 100)}%</span>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
