import { hasFeature, hasPermission, isAgencyRole } from '@cs/core';
import type { ClientProfile, RecommendationView } from '@cs/tools';
import type { Metadata } from 'next';
import { clientCrumbs } from '@/components/client-crumbs';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { RecommendationBoard } from '@/components/recommendation-board';
import { PAGE_COPY, type TipKey } from '@/help/copy';
import { setStatusAction } from './actions';
import { requireContext } from '@/server/current-viewer';
import { evidenceRefsFor } from '@/server/evidence-refs';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recommendations' };

const HELP_KEY = 'page:client.recommendations';
const COPY = PAGE_COPY['client.recommendations'];
const TIPS: readonly { label: string; tip: TipKey }[] = [
  { label: 'Stages', tip: 'client.recommendations.stages' },
  { label: 'Effort and impact', tip: 'client.recommendations.effortImpact' },
  { label: 'Who it is for', tip: 'client.recommendations.owner' },
  { label: 'Source', tip: 'client.recommendations.origin' },
];

export default async function RecommendationsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { viewer, ctx } = await requireContext();
  const profileP = callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  const recsP = callTool<{ items: RecommendationView[] }>(ctx, 'list_recommendations', { clientId });
  const [profile, recs, guides, refs] = await Promise.all([
    profileP,
    recsP,
    helpGuides(ctx, 'client', clientId),
    Promise.all([profileP, recsP]).then(([p, r]) => evidenceRefsFor(ctx, clientId, r.items.flatMap((i) => i.evidenceIds), p.timezone)),
  ]);
  // "Save from an assistant answer" is offered only when the viewer can: the Ask module on for a signed-in user (never a
  // guest) and the permission to give feedback, as on the evidence page. Otherwise the copy does not mention the assistant.
  const canSaveFromAsk = viewer.kind === 'user' && !ctx.userId.startsWith('contact:') && hasFeature(ctx, 'ask') && hasPermission(ctx, 'feedback') && hasFeature(ctx, 'dashboard');
  return (
    <>
      <PageHeader
        title="Recommendations"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Act', 'Recommendations')}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      {recs.items.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-ink">
          {TIPS.map((t) => (
            <span key={t.tip} className="inline-flex items-center gap-1.5">
              {t.label}
              <HelpTip tip={t.tip} />
            </span>
          ))}
        </div>
      )}
      <RecommendationBoard
        action={setStatusAction}
        clientId={clientId}
        items={recs.items}
        refs={refs}
        agency={isAgencyRole(ctx.role)}
        canEdit={viewer.kind === 'user' && hasPermission(ctx, 'manage')}
        empty={<EmptyState {...(canSaveFromAsk ? COPY.empty.noRecsAsk : COPY.empty.noRecs)} />}
      />
    </>
  );
}
