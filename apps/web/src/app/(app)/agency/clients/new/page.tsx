import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { timezoneOptions } from '@/server/timezones';
import { verticalOptions } from '@/server/verticals';
import { createClientAction, createClientFromLookupAction, findBusinessAction } from './actions';
import { LookupStep } from './lookup-step';
import { createVerticalAction, draftVerticalAction } from './vertical-actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add a client' };

export default async function NewClientPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  return (
    <>
      <PageHeader
        title="Add a client"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Add a client' }]}
        description="Next you’ll pick 3–5 competitors to monitor."
      />
      <LookupStep find={findBusinessAction} createFromLookup={createClientFromLookupAction} createByHand={createClientAction} verticals={await verticalOptions()} verticalActions={{ draft: draftVerticalAction, create: createVerticalAction }} timezoneOptions={timezoneOptions('America/Chicago')} canUpgrade={ctx.role === 'agency_admin'} />
    </>
  );
}
