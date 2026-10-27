import { isAgencyRole } from '@cs/core';
import type { AlertDetail, AlertSummary, ClientProfile } from '@cs/tools';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { clientCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PrevNext } from '@/components/prev-next';
import { AlertView } from '@/components/views/alert-view';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { evidenceRefsFor } from '@/server/evidence-refs';
import { helpGuides } from '@/server/help';
import { callTool, tryCallTool } from '@/server/tools';
import { formatDate } from '@/lib/format';
import { neighbours } from '../../briefs/neighbours';

export const dynamic = 'force-dynamic';

/** `list_alerts`' max page size: Previous / Next reach the newest 100 alerts. */
const NEIGHBOUR_LIMIT = 100;

const HELP_KEY = 'page:client.alerts.detail';
const COPY = PAGE_COPY['client.alerts.detail'];

/** One read per request, shared by the tab title and the page. A refused neighbour list just hides Previous / Next. */
const loadAlert = cache(async (clientId: string, alertId: string) => {
  const { ctx } = await requireContext();
  const [alert, profile, list] = await Promise.all([
    callTool<AlertDetail>(ctx, 'get_alert', { alertId }),
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    tryCallTool<{ items: AlertSummary[] }>(ctx, 'list_alerts', { clientId, limit: NEIGHBOUR_LIMIT }),
  ]);
  if (alert.clientId !== clientId) notFound();
  return { ctx, alert, profile, list };
});

export async function generateMetadata({ params }: { params: Promise<{ clientId: string; alertId: string }> }): Promise<Metadata> {
  const { clientId, alertId } = await params;
  return { title: (await loadAlert(clientId, alertId)).alert.headline };
}

/** Spec §2.8: breadcrumb `{client} › Briefs & reports › {date}`, Previous / Next by created date (the list's order). */
export default async function AlertPage({ params }: { params: Promise<{ clientId: string; alertId: string }> }) {
  const { clientId, alertId } = await params;
  const { ctx, alert, profile, list } = await loadAlert(clientId, alertId);
  const [guides, refs] = await Promise.all([helpGuides(ctx, 'client', clientId), evidenceRefsFor(ctx, clientId, alert.evidenceIds, profile.timezone)]);
  const agency = isAgencyRole(ctx.role);
  const { previous, next } = neighbours(list?.items ?? null, alert.id, (id) => `/c/${clientId}/alerts/${id}`);
  const date = formatDate(alert.deliveredAt ?? alert.createdAt, { tz: profile.timezone });
  return (
    <>
      <PageHeader
        title={alert.headline}
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, { label: 'Briefs & reports', href: `/c/${clientId}/briefs?tab=alerts` }, date)}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-ink">
        <span className="inline-flex items-center gap-1.5">
          Alert or brief
          <HelpTip tip="client.alerts.detail.alertVsBrief" />
        </span>
        {alert.evidenceIds.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            Evidence
            <HelpTip tip="client.briefs.detail.evidence" />
          </span>
        )}
        {agency && (
          <span className="inline-flex items-center gap-1.5">
            Score and status
            <HelpTip tip="client.alerts.detail.score" />
          </span>
        )}
      </div>
      <AlertView alert={alert} agency={agency} timezone={profile.timezone} titled={false} refs={refs} />
      <PrevNext previous={previous} next={next} />
    </>
  );
}
