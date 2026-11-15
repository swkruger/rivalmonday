import type { AgencyDomainsView } from '@cs/tools';
import { notFound } from 'next/navigation';
import { DomainPanel } from '@/components/agency/domain-panel';
import { SendingPanel } from '@/components/agency/sending-panel';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { formatDate } from '@/lib/format';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { removeCustomDomainAction, removeSendingDomainAction, setCustomDomainAction, setSendingDomainAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Domains' };

const HELP_KEY = 'page:agency.settings.domains';
const COPY = PAGE_COPY['agency.settings.domains'];

/**
 * 13a1 (spec 13a D2/D5): the agency's custom client web address and its email sending domain. Agency admins only; any other
 * role, and a support session, gets a 404 (like Intake link). One read: `get_agency_domains`.
 */
export default async function DomainsSettingsPage() {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || ctx.role !== 'agency_admin') notFound();
  const [view, guides, tz] = await Promise.all([callTool<AgencyDomainsView>(ctx, 'get_agency_domains', {}), helpGuides(ctx, 'agency'), viewerTimeZone()]);
  const liveDate = view.custom?.liveAt ? formatDate(view.custom.liveAt, { tz }) : null;
  return (
    <>
      <PageHeader
        title="Domains"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Domains' }]}
        description={
          <>
            <HelpText text={COPY.description} />
            {view.custom?.status !== 'live' && ` Until they are ready, clients use ${view.fallbackHost}.`}
          </>
        }
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Web address', tip: 'agency.settings.domains.webAddress' },
          { label: 'Email sending', tip: 'agency.settings.domains.emailSending' },
          { label: 'DMARC', tip: 'agency.settings.domains.dmarc' },
        ]}
      />
      <DomainPanel fallbackHost={view.fallbackHost} custom={view.custom} liveDate={liveDate} save={setCustomDomainAction} remove={removeCustomDomainAction} />
      <SendingPanel fromAddress={view.fromAddress} sending={view.sending} save={setSendingDomainAction} remove={removeSendingDomainAction} />
    </>
  );
}
