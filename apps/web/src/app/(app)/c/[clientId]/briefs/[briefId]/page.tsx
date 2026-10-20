import { isAgencyRole } from '@cs/core';
import type { BriefDetail, BriefSummary, ClientProfile } from '@cs/tools';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { clientCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PrevNext } from '@/components/prev-next';
import { BriefView } from '@/components/views/brief-view';
import { PAGE_COPY, type TipKey } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool, tryCallTool } from '@/server/tools';
import { formatDay } from '../format';
import { neighbours } from '../neighbours';

export const dynamic = 'force-dynamic';

/** `list_briefs`' max page size: Previous / Next reach the newest 52 briefs (a year). */
const NEIGHBOUR_LIMIT = 52;

const HELP_KEY = 'page:client.briefs.detail';
const COPY = PAGE_COPY['client.briefs.detail'];

/** The tips that apply to this brief: each one sits next to the part of the brief it explains. */
function briefTips(brief: BriefDetail, hasItems: boolean): { label: string; tip: TipKey }[] {
  const startingPoint = brief.kind === 'starting_point';
  return [
    ...(hasItems ? [{ label: 'Confidence', tip: 'client.briefs.detail.confidence' } as const, { label: 'Evidence', tip: 'client.briefs.detail.evidence' } as const] : []),
    ...(startingPoint ? [{ label: 'The starting point', tip: 'client.briefs.detail.startingPoint' } as const] : []),
    ...(!startingPoint && brief.scorecard ? [{ label: 'Quiet weeks', tip: 'client.briefs.detail.quiet' } as const] : []),
    ...(!startingPoint && brief.trend ? [{ label: 'Last days', tip: 'client.briefs.detail.trend' } as const] : []),
  ];
}

/** One read per request, shared by the tab title and the page. A refused neighbour list just hides Previous / Next. */
const loadBrief = cache(async (clientId: string, briefId: string) => {
  const { ctx } = await requireContext();
  const [brief, profile, list] = await Promise.all([
    callTool<BriefDetail>(ctx, 'get_brief', { briefId }),
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    tryCallTool<{ items: BriefSummary[] }>(ctx, 'list_briefs', { clientId, limit: NEIGHBOUR_LIMIT }),
  ]);
  if (brief.clientId !== clientId) notFound();
  return { ctx, brief, profile, list };
});

const titleOf = (brief: BriefDetail) => (brief.kind === 'starting_point' ? 'Your starting point' : `Week of ${formatDay(brief.deliveryDate)}`);

export async function generateMetadata({ params }: { params: Promise<{ clientId: string; briefId: string }> }): Promise<Metadata> {
  const { clientId, briefId } = await params;
  return { title: titleOf((await loadBrief(clientId, briefId)).brief) };
}

/** Spec §2.8: breadcrumb `{client} › Briefs & reports › {date}`, Previous / Next by delivery date, agency roles' way to Approvals. */
export default async function BriefPage({ params }: { params: Promise<{ clientId: string; briefId: string }> }) {
  const { clientId, briefId } = await params;
  const { ctx, brief, profile, list } = await loadBrief(clientId, briefId);
  const agency = isAgencyRole(ctx.role);
  const guides = await helpGuides(ctx, 'client', clientId);
  // Client roles only see active items (BriefView filters the same way).
  const tips = briefTips(brief, brief.items.some((i) => agency || i.status === 'active'));
  const { previous, next } = neighbours(list?.items ?? null, brief.id, (id) => `/c/${clientId}/briefs/${id}`);
  return (
    <>
      <PageHeader
        title={titleOf(brief)}
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, { label: 'Briefs & reports', href: `/c/${clientId}/briefs` }, formatDay(brief.deliveryDate))}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        actions={
          agency ? (
            <Link href={`/agency/approvals/${brief.id}`} className="font-semibold text-primary-soft-text">
              Open in approvals
            </Link>
          ) : undefined
        }
      />
      {tips.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {tips.map((t) => (
            <span key={t.tip} className="inline-flex items-center gap-1.5">
              {t.label}
              <HelpTip tip={t.tip} />
            </span>
          ))}
        </div>
      )}
      <BriefView brief={brief} agency={agency} titled={false} />
      <PrevNext previous={previous} next={next} />
    </>
  );
}
