import type { AccessContext } from '@cs/core';
import type { AlertSummary, BriefSummary, ClientProfile, ReportSummary } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { callTool } from '@/server/tools';

/** The 5a client home, kept for client users without the `dashboard` feature (briefs-only plans). */
export async function ClientHomeBasic({ clientId, ctx }: { clientId: string; ctx: AccessContext }) {
  const profile = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  const [briefs, alerts, reports] = await Promise.all([
    callTool<{ items: BriefSummary[] }>(ctx, 'list_briefs', { clientId, limit: 10 }),
    callTool<{ items: AlertSummary[] }>(ctx, 'list_alerts', { clientId, limit: 10 }),
    callTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
  ]);
  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">{profile.name}</h1>
        <p className="mt-1 text-muted-foreground">Weekly briefs, alerts and quarterly reports.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Weekly briefs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {briefs.items.length === 0 && <p className="text-muted-foreground">No briefs yet. The first one arrives on a Monday morning.</p>}
            {briefs.items.map((b) => (
              <Link key={b.id} href={`/c/${clientId}/briefs/${b.id}`} className="flex items-center gap-3 rounded-lg bg-muted-surface px-3 py-2 hover:bg-muted-surface-2">
                <span className="font-semibold">Week of {b.deliveryDate}</span>
                <span className="truncate text-muted-foreground">{b.summary}</span>
                <Badge variant="secondary" className="ml-auto">
                  {b.status}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {alerts.items.length === 0 && <p className="text-muted-foreground">No alerts.</p>}
              {alerts.items.map((a) => (
                <Link key={a.id} href={`/c/${clientId}/alerts/${a.id}`} className="rounded-lg px-2 py-1 hover:bg-muted-surface">
                  <span className="font-semibold">{a.competitorName}</span> — {a.headline}
                </Link>
              ))}
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
