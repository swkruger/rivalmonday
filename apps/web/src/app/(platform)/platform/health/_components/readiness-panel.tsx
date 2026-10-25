import type { PlatformHealth } from '@cs/tools';
import { StatusChip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { READINESS_CHECKPOINT, READINESS_SEVERITY, labelFor } from '@/lib/labels';

export type ReadinessData = NonNullable<PlatformHealth['briefReadiness']>;

const COUNTS: { key: Exclude<keyof ReadinessData, 'checkedAt' | 'deliveryDate' | 'issues'>; label: string }[] = [
  { key: 'due', label: 'Due' },
  { key: 'ready', label: 'Ready' },
  { key: 'approved', label: 'Approved' },
  { key: 'sent', label: 'Sent' },
  { key: 'missing', label: 'Missing' },
  { key: 'failed', label: 'Failed' },
  { key: 'awaitingApproval', label: 'Awaiting approval' },
  { key: 'startingPointsLate', label: 'Starting points late' },
];

/**
 * 7c2 brief readiness on /platform/health: this cycle's counts (each client against its own zone's Monday) and the open
 * readiness alerts, newest first. `now` is the server clock so relative times hydrate the same. `data` is null when the
 * readiness queries failed (the tool degrades that block only, like the queue stats).
 */
export function ReadinessPanel({ data, now, tz }: { data: ReadinessData | null; now: Date; tz: string }) {
  if (!data) return <p className="text-sm text-muted-foreground">Brief readiness unavailable — the readiness query failed; check the web logs.</p>;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Briefs for Monday {formatDate(data.deliveryDate, { tz, now })}</p>
        <ul aria-label="Brief counts" className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 xl:grid-cols-8">
          {COUNTS.map((c) => (
            <li key={c.key}>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <span className="text-lg font-semibold tabular-nums text-ink">{data[c.key]}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {data.issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">No readiness issues.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead><TableHead>Issue</TableHead><TableHead>Delivery date</TableHead><TableHead>Clients</TableHead><TableHead>First seen</TableHead><TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.issues.map((i) => {
              const sev = labelFor(READINESS_SEVERITY, i.severity);
              return (
                <TableRow key={i.id}>
                  <TableCell><StatusChip tone={sev.tone}>{sev.label}</StatusChip></TableCell>
                  <TableCell>
                    <span className="font-medium">{labelFor(READINESS_CHECKPOINT, i.checkpoint).label}</span>
                    {i.timezone ? <span className="text-muted-foreground"> · {i.timezone}</span> : null}
                  </TableCell>
                  <TableCell>{formatDate(i.deliveryDate, { tz, now })}</TableCell>
                  <TableCell>{i.clients}</TableCell>
                  <TableCell>
                    <time dateTime={i.firstSeenAt} title={formatDateTime(i.firstSeenAt, { tz, zoneLabel: true, now })}>{formatRelative(i.firstSeenAt, now, { tz })}</time>
                  </TableCell>
                  <TableCell>
                    {i.emailedAt ? (
                      <time dateTime={i.emailedAt} title={formatDateTime(i.emailedAt, { tz, zoneLabel: true, now })}>emailed {formatRelative(i.emailedAt, now, { tz })}</time>
                    ) : (
                      <span className="text-muted-foreground">not emailed yet</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
