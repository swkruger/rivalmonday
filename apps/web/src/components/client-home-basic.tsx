import { type AccessContext, isAgencyRole } from '@cs/core';
import type { AlertSummary, BriefSummary, ClientProfile, ReportSummary, SetupState, StartingPointStatus } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { helpGuides } from '@/server/help';
import { callTool, tryCallTool } from '@/server/tools';
import type { Viewer } from '@/server/viewer';
import { AskCard } from './ask/ask-card';
import { AlertLinkList, BriefLinkList } from './client-lists';
import { OwnerFirstVisit, type OwnerSetupRead } from './client/owner-first-visit';
import { PageHeader } from './page-header';
import { openSetupSteps, SetupBadge } from './setup-badge';
import { pendingStartingPoint, StartingPointCard } from './starting-point-card';

const HELP_KEY = 'page:client.overview';

/** The 5a client home, kept for client users without the `dashboard` feature (briefs-only plans). */
export async function ClientHomeBasic({ clientId, ctx, viewer }: { clientId: string; ctx: AccessContext; viewer: Viewer }) {
  const profile = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  const [briefs, alerts, reports, starting, setup, guides] = await Promise.all([
    callTool<{ items: BriefSummary[] }>(ctx, 'list_briefs', { clientId, limit: 10 }),
    callTool<{ items: AlertSummary[] }>(ctx, 'list_alerts', { clientId, limit: 10 }),
    callTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
    tryCallTool<StartingPointStatus>(ctx, 'get_starting_point_status', { clientId }),
    tryCallTool<{ state: SetupState; invite: { name: string | null } } & NonNullable<OwnerSetupRead>>(ctx, 'get_client_setup', { clientId }),
    helpGuides(ctx, 'client', clientId),
  ]);
  const setupSteps = openSetupSteps(setup, isAgencyRole(ctx.role));
  const preparing = pendingStartingPoint(starting, briefs.items);
  return (
    <>
      <PageHeader
        title="Overview"
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        description={`${profile.name} · Weekly briefs, alerts and quarterly reports.`}
        actions={
          <Link href={`/c/${clientId}/briefs`} className="font-semibold text-primary-soft-text">
            Brief archive →
          </Link>
        }
      />
      <OwnerFirstVisit clientId={clientId} ctx={ctx} viewer={viewer} setup={setup} />
      {setupSteps !== null && (
        <div>
          <SetupBadge clientId={clientId} {...setupSteps} />
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Weekly briefs</CardTitle>
          </CardHeader>
          <CardContent>
            {preparing ? (
              <StartingPointCard status={preparing} agency={false} />
            ) : (
              <BriefLinkList clientId={clientId} items={briefs.items} empty="No briefs yet. The first one arrives on a Monday morning." agency={isAgencyRole(ctx.role)} />
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-5">
          <AskCard clientId={clientId} ctx={ctx} />
          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <AlertLinkList clientId={clientId} items={alerts.items} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Quarterly reports</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {reports.items.length === 0 && <p className="text-muted-foreground">A report arrives in the first week after each quarter ends.</p>}
              {reports.items.map((r) => (
                <Link key={r.id} href={`/c/${clientId}/reports/${r.id}`} className="rounded-lg px-2 py-1 hover:bg-muted-surface">
                  {r.quarter}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
