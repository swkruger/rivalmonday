import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { formatDateTime } from '@/lib/format';

/** One `list_support_sessions` / `list_agency_support_sessions` row (`id` only on the console list). */
export interface SupportSessionRow {
  id?: string;
  startedAt: string;
  endedAt: string | null;
  platformUserName: string;
  reason: string;
  durationMinutes: number | null;
  endReason: 'exit' | 'expired' | 'replaced' | 'revoked' | null;
}

const END_REASON: Record<NonNullable<SupportSessionRow['endReason']>, string> = {
  exit: 'Exited',
  expired: 'Timed out',
  replaced: 'Replaced by a new session',
  revoked: 'Access revoked',
};

/** Phase 8b: support-session history, shared by the agency's Platform access page and the platform agency page. */
export function SupportSessionsTable({ rows, empty, tz }: { rows: SupportSessionRow[]; empty: string; tz: string }) {
  const when = (iso: string) => formatDateTime(iso, { tz, zoneLabel: true });
  if (rows.length === 0) return <p className="mt-3 text-sm text-muted-ink">{empty}</p>;
  return (
    <div className="mt-3">
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Started</TableHead>
            <TableHead scope="col">Ended</TableHead>
            <TableHead scope="col">Platform user</TableHead>
            <TableHead scope="col">Reason</TableHead>
            <TableHead scope="col">Duration</TableHead>
            <TableHead scope="col">End reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id ?? r.startedAt}>
              <TableCell>{when(r.startedAt)}</TableCell>
              <TableCell>{r.endedAt ? when(r.endedAt) : 'Open'}</TableCell>
              <TableCell className="font-semibold text-ink">{r.platformUserName}</TableCell>
              <TableCell className="whitespace-normal">{r.reason}</TableCell>
              <TableCell>{r.durationMinutes === null ? '—' : `${r.durationMinutes} min`}</TableCell>
              <TableCell className="whitespace-normal">{r.endReason ? END_REASON[r.endReason] : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
