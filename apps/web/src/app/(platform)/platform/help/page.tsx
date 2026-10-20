import { platformRole } from '@cs/tools';
import { HelpIndex } from '@/components/help/help-index';
import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { loadHelpIndex } from '@/server/help-index';
import { platformAdmins } from '@/server/runtime-env';
import { one } from '@/server/search-params';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Help' };

/** 15b-1: operator help. A non-operator's `list_help_guides` (context platform) is refused, which is a 404. */
export default async function PlatformHelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, ctx } = await requireOperatorContext();
  const sp = await searchParams;
  const role = viewer.kind === 'user' ? await platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx) : null;
  const index = await loadHelpIndex({ viewer, ctx, context: 'platform', q: one(sp.q), platformOwner: role === 'owner' });
  return (
    <>
      <PageHeader title="Help" breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Help' }]} description="Guides and search for the platform console." />
      <HelpIndex {...index} />
    </>
  );
}
