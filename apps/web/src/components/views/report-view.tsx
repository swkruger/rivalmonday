import { changeTypeLabel } from '@cs/email';
import { MOVE_LABELS } from '@cs/tools';
import type { TrendReportData } from '@cs/db';
import type { ReportDetail } from '@cs/tools';
import { Card, CardContent, CardHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { EmptyState } from '@/components/help/empty-state';
import { PAGE_COPY } from '@/help/copy';
import { formatDate } from '@/lib/format';
import { labelFor, MOVE_STATUS, sentenceCase } from '@/lib/labels';

const EMPTY = PAGE_COPY['client.reports.detail'].empty.noData;

const ratingArrow = (avg: number | null, prev: number | null) => {
  if (avg == null || prev == null || avg === prev) return '';
  return avg > prev ? ' ▲' : ' ▼';
};

/**
 * Spec §9.2: every number here is deterministic, computed and stored at generation time — nothing model-written to verify.
 * `titled={false}` (the report page, whose `PageHeader` names the quarter) drops the card's own title.
 */
export function ReportView({ report, titled = true }: { report: ReportDetail; titled?: boolean }) {
  const data = report.data as TrendReportData | null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        {titled && <h2 className="text-[17px] font-semibold leading-none">Competitor trends — {report.quarter}</h2>}
        {report.status === 'sent' && (
          <a href={`/files/report/${report.id}`} target="_blank" rel="noopener noreferrer" className="ml-auto font-semibold text-primary-soft-text">
            Download PDF
          </a>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-muted-foreground">
          {formatDate(report.periodStart, { tz: 'UTC' })} to {formatDate(report.periodEnd, { tz: 'UTC' })}
        </p>
        {!data ? (
          <EmptyState {...EMPTY} />
        ) : (
          <>
            <Table aria-label="Businesses">
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Reviews</TableHead>
                  <TableHead>Average rating</TableHead>
                  <TableHead>Active ads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.businesses.map((b) => (
                  <TableRow key={b.competitorId}>
                    <TableCell>{b.name}</TableCell>
                    <TableCell>{b.reviews}</TableCell>
                    <TableCell>
                      {b.avgRating ?? '—'}
                      {ratingArrow(b.avgRating, b.prevAvgRating)}
                    </TableCell>
                    <TableCell>{b.activeAds ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div>
              <h3 className="mb-1.5 text-[15px] font-bold">Changes detected</h3>
              <ul className="flex flex-col gap-1">
                {Object.entries(data.eventsByType).map(([type, count]) => (
                  <li key={type}>
                    {changeTypeLabel(type)}: {count}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-1.5 text-[15px] font-bold">Moves</h3>
              {data.moves.length === 0 ? (
                <p className="text-muted-foreground">No moves detected this quarter.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {data.moves.map((m, idx) => (
                    <li key={idx}>
                      {MOVE_LABELS[m.moveType] ?? sentenceCase(m.moveType)} &middot; {m.competitorName} &middot; {labelFor(MOVE_STATUS, m.status).label} &middot; first detected {formatDate(m.firstDetectedAt, { tz: 'UTC' })}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-4">
              <span className="rounded-md bg-muted-surface px-3 py-2 text-sm">Briefs sent: <b>{data.briefsSent}</b></span>
              <span className="rounded-md bg-muted-surface px-3 py-2 text-sm">Alerts delivered: <b>{data.alertsDelivered}</b></span>
              <span className="rounded-md bg-muted-surface px-3 py-2 text-sm">Recommendations created: <b>{data.recommendations.created}</b></span>
              <span className="rounded-md bg-muted-surface px-3 py-2 text-sm">Done: <b>{data.recommendations.done}</b></span>
              <span className="rounded-md bg-muted-surface px-3 py-2 text-sm">In progress: <b>{data.recommendations.inProgress}</b></span>
              <span className="rounded-md bg-muted-surface px-3 py-2 text-sm">Dismissed: <b>{data.recommendations.dismissed}</b></span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
