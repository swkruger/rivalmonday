import { isAgencyRole } from '@cs/core';
import type { BriefReview } from '@cs/tools';
import { Badge } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { ReviewFooter, ReviewItem } from './review-controls';
import { STATUS_LABEL } from '../status';

export const dynamic = 'force-dynamic';

export default async function ApprovalReviewPage({ params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const brief = await callTool<BriefReview>(ctx, 'get_brief_review', { briefId });

  const active = brief.items.filter((i) => i.status === 'active').sort((a, b) => a.ord - b.ord);
  const dropped = brief.items.filter((i) => i.status !== 'active').sort((a, b) => a.ord - b.ord);
  const sorted = [...active, ...dropped];
  const editable = brief.status === 'ready';
  const fixed = brief.factCheck.sentences > 0 || brief.factCheck.items > 0;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">
          {brief.clientName} · week of {brief.deliveryDate}
        </h1>
        <Badge variant="secondary">{STATUS_LABEL[brief.status] ?? brief.status}</Badge>
        <Link href={`/c/${brief.clientId}/briefs/${brief.id}`} className="ml-auto font-semibold text-primary-soft-text">
          Client view
        </Link>
      </div>

      <div className="rounded-lg bg-muted-surface p-3 text-ink">
        <p>✔ Every remaining sentence was checked against saved evidence.</p>
        {fixed && (
          <p>
            The fact-check removed {brief.factCheck.sentences} sentence(s) and {brief.factCheck.items} item(s) it couldn’t prove.
          </p>
        )}
      </div>

      <p className="leading-relaxed">{brief.summary}</p>

      {brief.kind === 'quiet' && <p className="text-muted-foreground">No significant competitor moves this week.</p>}

      <div className="flex flex-col gap-3">
        {sorted.map((item) => (
          <ReviewItem
            key={item.id}
            briefId={brief.id}
            item={item}
            editable={editable}
            first={item.status === 'active' && active[0]?.id === item.id}
            last={item.status === 'active' && active[active.length - 1]?.id === item.id}
          />
        ))}
      </div>

      <ReviewFooter briefId={brief.id} clientId={brief.clientId} status={brief.status} autoSend={brief.autoSend} />
    </>
  );
}
