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
import { createClientAction, createClientFromLookupAction, findBusinessAction } from './actions';
import { LookupStep } from './lookup-step';
import { createVerticalAction, draftVerticalAction } from './vertical-actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add a client' };

const HELP_KEY = 'page:agency.clients.new';
const COPY = PAGE_COPY['agency.clients.new'];

export default async function NewClientPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  const guides = await helpGuides(ctx, 'agency');
  return (
    <>
      <PageHeader
        title="Add a client"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Add a client' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Next steps', tip: 'agency.clients.new.steps' },
          { label: 'Business types', tip: 'agency.clients.new.businessType' },
          { label: 'No listing', tip: 'agency.clients.new.byHand' },
        ]}
      />
      <LookupStep find={findBusinessAction} createFromLookup={createClientFromLookupAction} createByHand={createClientAction} verticals={await verticalOptions()} verticalActions={{ draft: draftVerticalAction, create: createVerticalAction }} timezoneOptions={timezoneOptions('America/Chicago')} canUpgrade={ctx.role === 'agency_admin'} />
    </>
  );
}
