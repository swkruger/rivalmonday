import { clientCrumbs } from '@/components/client-crumbs';
import { HelpIndex } from '@/components/help/help-index';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { helpClientName } from '@/server/help';
import { loadHelpIndex } from '@/server/help-index';
import { one } from '@/server/search-params';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Help' };

/** 15b-1: client help, for anyone who can open the client (guests included). `list_help_guides` checks client access: a refusal is a 404. */
export default async function ClientHelpPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { viewer, ctx } = await requireContext();
  const index = await loadHelpIndex({ viewer, ctx, context: 'client', clientId, q: one(sp.q) });
  const name = await helpClientName(ctx, clientId);
  return (
    <>
      <PageHeader
        title="Help"
        breadcrumb={name ? clientCrumbs({ id: clientId, name }, 'Help') : [{ label: 'Help' }]}
        description="Guides and search for this workspace."
      />
      <HelpIndex {...index} />
    </>
  );
}
