import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { relativeTime } from '@/server/format';

export type HealthStatus = 'ok' | 'warn' | 'down';

/** Shape of `get_platform_health` (packages/tools/src/platform/system-health.ts), kept structural for the page. */
export interface HealthData {
  generatedAt: string;
  worker: { lastHeartbeatAt: string | null; status: HealthStatus };
  queues: { name: string; queued: number; active: number; failed24h: number; oldestQueuedAgeS: number | null; status: HealthStatus }[];
  vendors: { vendor: string; calls24h: number; errors24h: number; lastOkAt: string | null; status: HealthStatus }[];
  sources: { kind: 'vendor_call' | 'capture'; lastOkAt: string | null; status: HealthStatus }[];
  sentryUrl: string | null;
}

const LABEL: Record<HealthStatus, string> = { ok: 'OK', warn: 'Watch', down: 'Down' };
const TONE: Record<HealthStatus, string> = {
  ok: 'bg-[#DCFCE7] text-[#15803D]',
  warn: 'bg-[#FFF3DC] text-[#B45309]',
  down: 'bg-[#FEE2E2] text-[#B91C1C]',
};
const SOURCE_LABEL = { vendor_call: 'Vendor calls (last successful)', capture: 'Web captures (last successful)' } as const;

export const StatusChip = ({ status }: { status: HealthStatus }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[status]}`}>{LABEL[status]}</span>
);

/** Relative time with the absolute UTC time on hover; `now` is the server clock so hydration matches. */
function When({ iso, now, never }: { iso: string | null; now: Date; never: string }) {
  if (!iso) return <span className="text-muted-foreground">{never}</span>;
  return <time dateTime={iso} title={`${iso.slice(0, 16).replace('T', ' ')} UTC`}>{relativeTime(iso, now)}</time>;
}

function age(s: number | null): string {
  if (s === null) return '—';
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

export function WorkerTable({ worker, now }: { worker: HealthData['worker']; now: Date }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Status</TableHead><TableHead>Last heartbeat</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell><StatusChip status={worker.status} /></TableCell>
          <TableCell><When iso={worker.lastHeartbeatAt} now={now} never="No heartbeat yet" /></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function QueuesTable({ queues }: { queues: HealthData['queues'] }) {
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
            <TableCell><StatusChip status={q.status} /></TableCell>
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

export function VendorsTable({ vendors, now }: { vendors: HealthData['vendors']; now: Date }) {
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
            <TableCell><StatusChip status={v.status} /></TableCell>
            <TableCell>{v.calls24h}</TableCell>
            <TableCell>{v.errors24h}</TableCell>
            <TableCell><When iso={v.lastOkAt} now={now} never="None in 48 h" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SourcesTable({ sources, now }: { sources: HealthData['sources']; now: Date }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((s) => (
          <TableRow key={s.kind}>
            <TableCell className="font-medium">{SOURCE_LABEL[s.kind]}</TableCell>
            <TableCell><StatusChip status={s.status} /></TableCell>
            <TableCell><When iso={s.lastOkAt} now={now} never="Never" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
