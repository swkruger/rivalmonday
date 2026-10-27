import type { AlertDetail } from '@cs/tools';
import { StatusChip } from '@cs/ui';
import { EvidenceChips } from '@/components/evidence-chips';
import type { EvidenceRefs } from '@/server/evidence-refs';
import { formatDateTime } from '@/lib/format';
import { ALERT_STATUS, labelFor } from '@/lib/labels';

/**
 * The `written === 'template'` note tells an agency reader the model text failed verification and a
 * deterministic template was sent instead (HANDOVER §6 "Review a few rendered template alerts…"). Client
 * roles never see it, or the score/status badges — this is the one agency-only distinction in alert text.
 * `titled={false}` (the alert page, whose `PageHeader` is the headline) drops the card's own headline.
 */
export function AlertView({ alert, agency, timezone, titled = true, refs }: { alert: AlertDetail; agency: boolean; timezone: string; titled?: boolean; refs?: EvidenceRefs }) {
  const when = alert.deliveredAt ?? alert.createdAt;
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink-secondary">{alert.competitorName}</span>
        {agency && <StatusChip tone="neutral">Score {Math.round(alert.score)}</StatusChip>}
        {agency && <StatusChip tone={labelFor(ALERT_STATUS, alert.status).tone}>{labelFor(ALERT_STATUS, alert.status).label}</StatusChip>}
        <span className="ml-auto text-sm text-muted-ink">{formatDateTime(when, { tz: timezone, zoneLabel: true })}</span>
      </div>
      {titled && <h2 className="text-lg font-semibold text-ink">{alert.headline}</h2>}
      <p className="text-base leading-relaxed">{alert.body}</p>
      <EvidenceChips clientId={alert.clientId} ids={alert.evidenceIds} refs={refs} />
      {agency && alert.written === 'template' && (
        <p className="text-sm text-muted-ink">Template text (the model text did not pass verification).</p>
      )}
    </div>
  );
}
