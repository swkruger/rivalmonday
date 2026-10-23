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
  if (rows.length === 0) return <p className="mt-3 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-semibold">Started</th>
            <th scope="col" className="px-3 py-2 font-semibold">Ended</th>
            <th scope="col" className="px-3 py-2 font-semibold">Platform user</th>
            <th scope="col" className="px-3 py-2 font-semibold">Reason</th>
            <th scope="col" className="px-3 py-2 font-semibold">Duration</th>
            <th scope="col" className="px-3 py-2 font-semibold">End reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? r.startedAt} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-2">{when(r.startedAt)}</td>
              <td className="whitespace-nowrap px-3 py-2">{r.endedAt ? when(r.endedAt) : 'Open'}</td>
              <td className="px-3 py-2 font-semibold">{r.platformUserName}</td>
              <td className="px-3 py-2">{r.reason}</td>
              <td className="whitespace-nowrap px-3 py-2">{r.durationMinutes === null ? '—' : `${r.durationMinutes} min`}</td>
              <td className="px-3 py-2">{r.endReason ? END_REASON[r.endReason] : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
