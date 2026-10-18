import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { timezoneOptions } from '@/server/timezones';
import { verticalOptions } from '@/server/verticals';
import { findBusinessAction } from '../../clients/new/actions';
import { LookupStep } from '../../clients/new/lookup-step';
import { createProspectAction, createProspectFromLookupAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add a prospect' };

export default async function NewProspectPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  return (
    <>
      <PageHeader
        title="Add a prospect"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Prospects', href: '/agency/prospects' }, { label: 'Add a prospect' }]}
        description="Profile first — keywords and a service area let us find their competitors."
      />
      <LookupStep find={findBusinessAction} createFromLookup={createProspectFromLookupAction} createByHand={createProspectAction} byHandSubmitLabel="Create prospect" createLabel="Create prospect" verticals={await verticalOptions()} timezoneOptions={timezoneOptions('America/Chicago')} />
    </>
  );
}
