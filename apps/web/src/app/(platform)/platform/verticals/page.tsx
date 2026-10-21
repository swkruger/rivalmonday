import { platformRole } from '@cs/tools';
import { normaliseName } from '@cs/verticals';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { catalogReviewAction } from './actions';
import { CatalogQueue, type ReviewArea, type ReviewVertical, type TargetVertical } from './catalog-queue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Business types' };

const HELP_KEY = 'page:platform.verticals';
const COPY = PAGE_COPY['platform.verticals'];

/** Phase 14a: the operator queue for business types and services agencies added. Operators only (a refusal is a 404). */
export default async function PlatformVerticalsPage() {
  const { ctx } = await requireOperatorContext();
  const [review, all, role, guides] = await Promise.all([
    callTool<{ verticals: ReviewVertical[]; areas: ReviewArea[]; count: number }>(ctx, 'list_catalog_review', {}),
    callTool<{ verticals: TargetVertical[] }>(ctx, 'list_verticals', {}),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
    helpGuides(ctx, 'platform'),
  ]);
  const targets = all.verticals.filter((v) => v.status === 'reviewed');
  // Merge form defaults: each source area maps to the target area with the same normalised name, else null ("Move").
  const defaultMaps: Record<string, Record<string, Record<string, string | null>>> = {};
  for (const v of review.verticals) {
    defaultMaps[v.id] = {};
    for (const t of targets.filter((x) => x.id !== v.id)) {
      const byName = new Map(t.services.map((s) => [normaliseName(s.name), s.id]));
      defaultMaps[v.id]![t.id] = Object.fromEntries(v.services.map((s) => [s.id, byName.get(normaliseName(s.name)) ?? null]));
    }
  }
  return (
    <>
      <PageHeader
        title="Business types"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Business types' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'What lands here', tip: 'platform.verticals.queue' },
          { label: 'Approving and editing', tip: 'platform.verticals.approve' },
          { label: 'Merging duplicates', tip: 'platform.verticals.merge' },
          { label: 'Who can change things', tip: 'platform.verticals.roles' },
        ]}
      />
      <CatalogQueue
        verticals={review.verticals}
        areas={review.areas}
        targets={targets}
        catalogue={all.verticals}
        defaultMaps={defaultMaps}
        canEdit={role === 'owner' || role === 'staff'}
        action={catalogReviewAction}
      />
    </>
  );
}
