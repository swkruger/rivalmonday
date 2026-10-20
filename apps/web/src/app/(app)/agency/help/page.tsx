import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { HelpIndex } from '@/components/help/help-index';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { loadHelpIndex } from '@/server/help-index';
import { one } from '@/server/search-params';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Help' };

/** 15b-1: agency help, for agency roles only. */
export default async function AgencyHelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const sp = await searchParams;
  const index = await loadHelpIndex({ viewer, ctx, context: 'agency', q: one(sp.q) });
  return (
    <>
      <PageHeader title="Help" breadcrumb={[{ label: 'Help' }]} description="Guides and search for your agency workspace." />
      <HelpIndex {...index} />
    </>
  );
}
