import type { PlatformHealth } from '@cs/tools';
import { StatusChip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { formatDateTime, formatRelative } from '@/lib/format';
import { HEALTH_STATUS } from '@/lib/labels';

export type HealthData = PlatformHealth;
export type HealthStatus = PlatformHealth['worker']['status'];

const SOURCE_LABEL = { vendor_call: 'Vendor calls (last successful)', capture: 'Web captures (last successful)' } as const;

/** Working / Slow / Down, as a chip (the one place the console shows a health status). */
export function HealthChip({ status }: { status: HealthStatus }) {
  const { label, tone } = HEALTH_STATUS[status];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

/** Relative time with the absolute time (viewer zone) on hover; `now` is the server clock so hydration matches. */
function When({ iso, now, never, tz }: { iso: string | null; now: Date; never: string; tz: string }) {
  if (!iso) return <span className="text-muted-foreground">{never}</span>;
  return <time dateTime={iso} title={formatDateTime(iso, { tz, zoneLabel: true, now })}>{formatRelative(iso, now, { tz })}</time>;
}

function age(s: number | null): string {
  if (s === null) return '—';
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

export function WorkerTable({ worker, now, tz }: { worker: HealthData['worker']; now: Date; tz: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Status</TableHead><TableHead>Last heartbeat</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell><HealthChip status={worker.status} /></TableCell>
          <TableCell><When tz={tz} iso={worker.lastHeartbeatAt} now={now} never="No heartbeat yet" /></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function QueuesTable({ queues, queueError = false }: { queues: HealthData['queues']; queueError?: boolean }) {
  if (queueError) return <p className="text-sm text-muted-foreground">Queue database unreachable — check the worker&apos;s grants and DATABASE_URL.</p>;
  if (queues.length === 0) return <p className="text-sm text-muted-foreground">No queues reported.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Queue</TableHead><TableHead>Status</TableHead><TableHead>Queued</TableHead><TableHead>Running</TableHead><TableHead>Failed (24 h)</TableHead><TableHead>Oldest waiting</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {queues.map((q) => (
          <TableRow key={q.name}>
            <TableCell className="font-medium">{q.name}</TableCell>
            <TableCell><HealthChip status={q.status} /></TableCell>
            <TableCell>{q.queued}</TableCell>
            <TableCell>{q.active}</TableCell>
            <TableCell>{q.failed24h}</TableCell>
            <TableCell>{age(q.oldestQueuedAgeS)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function VendorsTable({ vendors, now, tz }: { vendors: HealthData['vendors']; now: Date; tz: string }) {
  if (vendors.length === 0) return <p className="text-sm text-muted-foreground">No vendor calls in the last 48 hours.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vendor</TableHead><TableHead>Status</TableHead><TableHead>Calls (24 h)</TableHead><TableHead>Errors (24 h)</TableHead><TableHead>Last success</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendors.map((v) => (
          <TableRow key={v.vendor}>
            <TableCell className="font-medium">{v.vendor}</TableCell>
            <TableCell><HealthChip status={v.status} /></TableCell>
            <TableCell>{v.calls24h}</TableCell>
            <TableCell>{v.errors24h}</TableCell>
            <TableCell><When tz={tz} iso={v.lastOkAt} now={now} never="None in 48 h" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SourcesTable({ sources, now, tz }: { sources: HealthData['sources']; now: Date; tz: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((s) => (
          <TableRow key={s.kind}>
            <TableCell className="font-medium">{SOURCE_LABEL[s.kind]}</TableCell>
            <TableCell><HealthChip status={s.status} /></TableCell>
            <TableCell><When tz={tz} iso={s.lastOkAt} now={now} never="Never" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
