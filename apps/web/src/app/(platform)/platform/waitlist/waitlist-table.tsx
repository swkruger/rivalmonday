import { StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow, Tag } from '@cs/ui';
import { formatDate } from '@/lib/format';
import { labelFor, SAMPLE_STAGE, SAMPLE_STATUS, WAITLIST_STATUS } from '@/lib/labels';

export type WaitlistTab = 'agencies' | 'businesses' | 'samples';

export interface WaitlistRow {
  id: string;
  kind: 'agency' | 'business';
  status: string;
  contactName: string;
  email: string;
  orgName: string;
  location: string | null;
  verticalId: string | null;
  verticalOther: string | null;
  clientCountBand: string | null;
  emailConfirmed: boolean;
  createdAt: string;
  sample: { businessName: string | null; location: string | null; website: string | null; status: string; stage: string | null } | null;
}

const dash = '—';

/** Detail column: agencies show their size band, businesses their type and place, samples the business asked for. */
function Detail({ row, tab, verticals }: { row: WaitlistRow; tab: WaitlistTab; verticals: Map<string, string> }) {
  const type = row.verticalOther ?? (row.verticalId ? (verticals.get(row.verticalId) ?? row.verticalId) : null);
  if (tab === 'samples' && row.sample) {
    return (
      <>
        <div className="text-ink">{row.sample.businessName ?? dash}</div>
        <div className="text-xs text-muted-ink">{[row.sample.location, row.sample.website].filter(Boolean).join(' · ')}</div>
      </>
    );
  }
  const parts = tab === 'businesses' ? [type, row.location] : [row.clientCountBand ? `${row.clientCountBand} clients` : null];
  return <div className="text-muted-ink">{parts.filter(Boolean).join(' · ') || dash}</div>;
}

/**
 * Phase 17a Task 7: the waitlist table, read-only. The checkbox column is the Agencies tab's (bulk invite) and the Actions
 * column is filled by the invite, assign and sample tasks.
 */
export function WaitlistTable({ rows, tab, tz, verticals }: { rows: WaitlistRow[]; tab: WaitlistTab; tz: string; verticals: Map<string, string> }) {
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            {tab === 'agencies' && <TableHead className="w-8"><span className="sr-only">Select</span></TableHead>}
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Detail</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const status = tab === 'samples' && r.sample ? labelFor(SAMPLE_STATUS, r.sample.status) : labelFor(WAITLIST_STATUS, r.status);
            const stage = tab === 'samples' && r.sample?.stage ? labelFor(SAMPLE_STAGE, r.sample.stage) : null;
            return (
              <TableRow key={r.id}>
                {tab === 'agencies' && (
                  <TableCell>
                    <input type="checkbox" className="size-4 accent-secondary" aria-label={`Select ${r.orgName}`} disabled={r.status !== 'new' || !r.emailConfirmed} />
                  </TableCell>
                )}
                <TableCell>
                  <div className="font-semibold text-ink">{r.orgName}</div>
                  <div className="text-xs text-muted-ink">{r.contactName}</div>
                </TableCell>
                <TableCell>
                  <div>{r.email}</div>
                  {!r.emailConfirmed && <Tag>Not confirmed</Tag>}
                </TableCell>
                <TableCell><Detail row={r} tab={tab} verticals={verticals} /></TableCell>
                <TableCell>
                  <StatusChip tone={status.tone}>{status.label}</StatusChip>
                  {stage && <div className="mt-1 text-xs text-muted-ink">{stage.label}</div>}
                </TableCell>
                <TableCell>{formatDate(r.createdAt, { tz })}</TableCell>
                <TableCell>{/* Tasks 8-11: invite, assign, approve and send sample */}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
