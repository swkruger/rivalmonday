import { isAgencyRole } from '@cs/core';
import { scorecardModel } from '@cs/engine';
import type { BriefReview } from '@cs/tools';
import { Band, Section, StatusChip } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { formatWeekOf } from '@/lib/format';
import { BRIEF_STATUS, labelFor } from '@/lib/labels';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { evidenceRefsFor } from '@/server/evidence-refs';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { Scorecard } from '@/components/views/scorecard';
import { ReviewFooter, ReviewItem } from './review-controls';
import { mondaySendTime } from './send-time';

export const dynamic = 'force-dynamic';

const HELP_KEY = 'page:agency.approvals.detail';
const COPY = PAGE_COPY['agency.approvals.detail'];

/** One read per request, shared by the tab title and the page. */
const loadBrief = cache(async (briefId: string) => {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return callTool<BriefReview>(ctx, 'get_brief_review', { briefId });
});

const titleOf = (brief: BriefReview) => `${brief.clientName} · ${brief.kind === 'starting_point' ? 'Starting point' : formatWeekOf(brief.deliveryDate, { tz: 'UTC' })}`;

export async function generateMetadata({ params }: { params: Promise<{ briefId: string }> }): Promise<Metadata> {
  return { title: titleOf(await loadBrief((await params).briefId)) };
}

export default async function ApprovalReviewPage({ params }: { params: Promise<{ briefId: string }> }) {
  const brief = await loadBrief((await params).briefId);
  const { ctx } = await requireContext();
  const guides = await helpGuides(ctx, 'agency');

  const active = brief.items.filter((i) => i.status === 'active').sort((a, b) => a.ord - b.ord);
  const dropped = brief.items.filter((i) => i.status !== 'active').sort((a, b) => a.ord - b.ord);
  const sorted = [...active, ...dropped];
  const editable = brief.status === 'ready';
  const fixed = brief.factCheck.sentences > 0 || brief.factCheck.items > 0;
  const startingPoint = brief.kind === 'starting_point';
  const refs = await evidenceRefsFor(ctx, brief.clientId, sorted.flatMap((i) => i.evidenceIds), brief.clientTimezone);

  return (
    <>
      <PageHeader
        title={titleOf(brief)}
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Approvals', href: '/agency/approvals' }, { label: titleOf(brief) }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        actions={
          <>
            <StatusChip tone={labelFor(BRIEF_STATUS, brief.status).tone}>{labelFor(BRIEF_STATUS, brief.status).label}</StatusChip>
            <Link href={`/c/${brief.clientId}/briefs/${brief.id}`} className="font-semibold text-primary-soft-text">
              Client view
            </Link>
          </>
        }
      />

      <TipRow
        items={[
          { label: 'Confidence', tip: 'agency.approvals.detail.confidence' },
          { label: 'Fact-check', tip: 'agency.approvals.detail.factCheck' },
          { label: 'Upsell tags', tip: 'agency.approvals.detail.upsell' },
          { label: 'Approving', tip: 'agency.approvals.detail.approving' },
          { label: 'Ratings', tip: 'agency.approvals.detail.rating' },
        ]}
      />

      <Band tone="muted" className="p-3 text-ink">
        <p>✔ Every remaining sentence was checked against saved evidence.</p>
        {fixed && (
          <p>
            The fact-check removed {brief.factCheck.sentences} sentence(s) and {brief.factCheck.items} item(s) it couldn’t prove.
          </p>
        )}
      </Band>

      <p className="leading-relaxed">{brief.summary}</p>

      {brief.kind === 'quiet' && <p className="text-muted-ink">No significant competitor moves this week.</p>}

      {startingPoint && brief.scorecard && <Scorecard model={scorecardModel(brief.scorecard, { clientName: brief.clientName })} />}

      <Section>
        {sorted.map((item) => (
          <ReviewItem
            key={item.id}
            briefId={brief.id}
            clientId={brief.clientId}
            item={item}
            editable={editable}
            first={item.status === 'active' && active[0]?.id === item.id}
            last={item.status === 'active' && active[active.length - 1]?.id === item.id}
            refs={refs}
          />
        ))}
      </Section>

      <ReviewFooter briefId={brief.id} clientId={brief.clientId} status={brief.status} autoSend={brief.autoSend} startingPoint={startingPoint} sendTime={mondaySendTime(brief.clientTimezone)} />
    </>
  );
}
