import type { AlertDetail } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';

/**
 * The `written === 'template'` note tells an agency reader the model text failed verification and a
 * deterministic template was sent instead (HANDOVER §6 "Review a few rendered template alerts…"). Client
 * roles never see it, or the score/status badges — this is the one agency-only distinction in alert text.
 */
export function AlertView({ alert, agency }: { alert: AlertDetail; agency: boolean }) {
  const when = alert.deliveredAt ?? alert.createdAt;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <CardTitle className="text-[15px] text-muted-foreground">{alert.competitorName}</CardTitle>
        {agency && <Badge variant="secondary">Score {Math.round(alert.score)}</Badge>}
        {agency && <Badge variant="outline">{alert.status}</Badge>}
        <span className="ml-auto text-sm text-muted-foreground">{when}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-[17px] font-bold">{alert.headline}</h2>
        <p className="leading-relaxed">{alert.body}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text">{alert.evidenceIds.length} evidence items</span>
        </div>
        {agency && alert.written === 'template' && (
          <p className="text-sm text-muted-foreground">Template text (the model text did not pass verification).</p>
        )}
      </CardContent>
    </Card>
  );
}
