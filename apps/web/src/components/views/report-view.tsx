import { changeTypeLabel } from '@cs/email';
import { MOVE_LABELS } from '@cs/tools';
import type { TrendReportData } from '@cs/db';
import type { ReportDetail } from '@cs/tools';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
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
 * `titled={false}` (the report page, whose `PageHeader` names the quarter) drops the view's own title.
 */
export function ReportView({ report, titled = true }: { report: ReportDetail; titled?: boolean }) {
  const data = report.data as TrendReportData | null;
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {titled && <h2 className="text-lg font-semibold text-ink">Competitor trends — {report.quarter}</h2>}
        {report.status === 'sent' && (
          <a href={`/files/report/${report.id}`} target="_blank" rel="noopener noreferrer" className="ml-auto font-semibold text-primary-soft-text">
            Download PDF
          </a>
        )}
      </div>
      <p className="text-muted-ink">
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
                  <TableHead numeric>Reviews</TableHead>
                  <TableHead numeric>Average rating</TableHead>
                  <TableHead numeric>Active ads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.businesses.map((b) => (
                  <TableRow key={b.competitorId}>
                    <TableCell>{b.name}</TableCell>
                    <TableCell numeric>{b.reviews}</TableCell>
                    <TableCell numeric>
                      {b.avgRating ?? '—'}
                      {ratingArrow(b.avgRating, b.prevAvgRating)}
                    </TableCell>
                    <TableCell numeric>{b.activeAds ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div>
              <h3 className="mb-1.5 text-base font-semibold">Changes detected</h3>
              <ul className="flex flex-col gap-1">
                {Object.entries(data.eventsByType).map(([type, count]) => (
                  <li key={type}>
                    {changeTypeLabel(type)}: {count}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-1.5 text-base font-semibold">Moves</h3>
              {data.moves.length === 0 ? (
                <p className="text-muted-ink">No moves detected this quarter.</p>
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

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ['Briefs sent', data.briefsSent],
                ['Alerts delivered', data.alertsDelivered],
                ['Recommendations created', data.recommendations.created],
                ['Done', data.recommendations.done],
                ['In progress', data.recommendations.inProgress],
                ['Dismissed', data.recommendations.dismissed],
              ].map(([label, n]) => (
                <div key={label}>
                  <dt className="text-13 text-muted-ink">{label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
    </div>
  );
}
