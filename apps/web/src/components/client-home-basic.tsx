import { type AccessContext, isAgencyRole } from '@cs/core';
import type { AlertSummary, BriefSummary, ClientProfile, ReportSummary, SetupState, StartingPointStatus } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { callTool, tryCallTool } from '@/server/tools';
import { AskCard } from './ask/ask-card';
import { AlertLinkList, BriefLinkList } from './client-lists';
import { openSetupSteps, SetupBadge } from './setup-badge';
import { pendingStartingPoint, StartingPointCard } from './starting-point-card';

/** The 5a client home, kept for client users without the `dashboard` feature (briefs-only plans). */
export async function ClientHomeBasic({ clientId, ctx }: { clientId: string; ctx: AccessContext }) {
  const profile = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  const [briefs, alerts, reports, starting, setup] = await Promise.all([
    callTool<{ items: BriefSummary[] }>(ctx, 'list_briefs', { clientId, limit: 10 }),
    callTool<{ items: AlertSummary[] }>(ctx, 'list_alerts', { clientId, limit: 10 }),
    callTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
    tryCallTool<StartingPointStatus>(ctx, 'get_starting_point_status', { clientId }),
    tryCallTool<{ state: SetupState }>(ctx, 'get_client_setup', { clientId }),
  ]);
  const setupSteps = openSetupSteps(setup, isAgencyRole(ctx.role));
  const preparing = pendingStartingPoint(starting, briefs.items);
  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">{profile.name}</h1>
        <p className="mt-1 text-muted-foreground">Weekly briefs, alerts and quarterly reports.</p>
        {setupSteps !== null && (
          <div className="mt-2">
            <SetupBadge clientId={clientId} open {...setupSteps} />
          </div>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Weekly briefs</CardTitle>
          </CardHeader>
          <CardContent>
            {preparing ? (
              <StartingPointCard status={preparing} agency={false} />
            ) : (
              <BriefLinkList clientId={clientId} items={briefs.items} empty="No briefs yet. The first one arrives on a Monday morning." />
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
              {reports.items.length === 0 && <p className="text-muted-foreground">The first report arrives after a full quarter.</p>}
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
