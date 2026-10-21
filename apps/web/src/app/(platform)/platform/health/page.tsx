import { isPlatformOperator } from '@cs/tools';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { platformAdmins } from '@/server/runtime-env';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Health' };

const HELP_KEY = 'page:platform.health';
const COPY = PAGE_COPY['platform.health'];

/** Placeholder (spec d6). Gated by the operator check directly (no tool call, so no audit row); others get the 404. */
export default async function PlatformHealthPage() {
  const { ctx } = await requireOperatorContext();
  if (!(await isPlatformOperator({ service: dbs().service, platformAdmins: platformAdmins() }, ctx))) notFound();
  const guides = await helpGuides(ctx, 'platform');
  return (
    <>
      <PageHeader
        title="Health"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Health' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <EmptyState {...COPY.empty.placeholder} guideAnchor="what-this-page-tells-you" />
    </>
  );
}
