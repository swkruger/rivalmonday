import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { timezoneOptions } from '@/server/timezones';
import { verticalOptions } from '@/server/verticals';
import { findBusinessAction } from '../../clients/new/actions';
import { LookupStep } from '../../clients/new/lookup-step';
import { createProspectAction, createProspectFromLookupAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add a prospect' };

const HELP_KEY = 'page:agency.prospects.new';
const COPY = PAGE_COPY['agency.prospects.new'];

export default async function NewProspectPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  const guides = await helpGuides(ctx, 'agency');
  return (
    <>
      <PageHeader
        title="Add a prospect"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Prospects', href: '/agency/prospects' }, { label: 'Add a prospect' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Prospects', tip: 'agency.prospects.new.prospect' },
          { label: 'Business types', tip: 'agency.prospects.new.businessType' },
          { label: 'Next steps', tip: 'agency.prospects.new.next' },
        ]}
      />
      <LookupStep find={findBusinessAction} createFromLookup={createProspectFromLookupAction} createByHand={createProspectAction} byHandSubmitLabel="Create prospect" createLabel="Create prospect" verticals={await verticalOptions()} timezoneOptions={timezoneOptions('America/Chicago')} />
    </>
  );
}
