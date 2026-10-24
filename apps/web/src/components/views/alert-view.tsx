import type { AlertDetail } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle, StatusChip } from '@cs/ui';
import { EvidenceChips } from '@/components/evidence-chips';
import { formatDateTime } from '@/lib/format';
import { ALERT_STATUS, labelFor } from '@/lib/labels';

/**
 * The `written === 'template'` note tells an agency reader the model text failed verification and a
 * deterministic template was sent instead (HANDOVER §6 "Review a few rendered template alerts…"). Client
 * roles never see it, or the score/status badges — this is the one agency-only distinction in alert text.
 * `titled={false}` (the alert page, whose `PageHeader` is the headline) drops the card's own headline.
 */
export function AlertView({ alert, agency, timezone, titled = true }: { alert: AlertDetail; agency: boolean; timezone: string; titled?: boolean }) {
  const when = alert.deliveredAt ?? alert.createdAt;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <CardTitle className="text-[15px] text-muted-foreground">{alert.competitorName}</CardTitle>
        {agency && <StatusChip tone="neutral">Score {Math.round(alert.score)}</StatusChip>}
        {agency && <StatusChip tone={labelFor(ALERT_STATUS, alert.status).tone}>{labelFor(ALERT_STATUS, alert.status).label}</StatusChip>}
        <span className="ml-auto text-sm text-muted-foreground">{formatDateTime(when, { tz: timezone, zoneLabel: true })}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {titled && <h2 className="text-[17px] font-bold">{alert.headline}</h2>}
        <p className="leading-relaxed">{alert.body}</p>
        <EvidenceChips clientId={alert.clientId} ids={alert.evidenceIds} />
        {agency && alert.written === 'template' && (
          <p className="text-sm text-muted-foreground">Template text (the model text did not pass verification).</p>
        )}
      </CardContent>
    </Card>
  );
}
