import { segmentedItemClass, segmentedTrackClass, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { ConfirmForm } from '@/components/confirm-form';
import { setSignupsPausedAction } from './actions';

export interface FunnelCounts { signups: number; profileDone: number; firstClient: number; cardAdded: number }
export interface SignupRow {
  agencyId: string; agencyName: string; source: 'open' | 'invite'; createdAt: string;
  website: string | null; clientsServed: '0' | '1-5' | '6-20' | '21+' | null; check: boolean;
}
export interface SignupFunnel { open: FunnelCounts; invite: FunnelCounts; recent: SignupRow[] }

const SERVED_LABEL = { '0': 'None yet', '1-5': '1–5', '6-20': '6–20', '21+': '21 or more' } as const;
/** D9: shown on the Check chip. Staff read it; it never blocks anything. */
export const CHECK_TIP = "No clients yet, or the agency's first client shares its website.";
export type FunnelDays = 30 | 90;

export const parseDays = (v: string | string[] | undefined): FunnelDays => (v === '90' ? 90 : 30);

const COLUMNS: { key: keyof FunnelCounts; label: string }[] = [
  { key: 'signups', label: 'Sign-ups' },
  { key: 'profileDone', label: 'Profile done' },
  { key: 'firstClient', label: 'First client' },
  { key: 'cardAdded', label: 'Card added' },
];

/** Open sign-up switch (owners flip it; everyone sees it) and the sign-up funnel for the last 30/90 days. */
export function SignupsPanel({ paused, canEdit, days, funnel }: { paused: boolean; canEdit: boolean; days: FunnelDays; funnel: SignupFunnel }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm" role="status">
          Open sign-up is <strong>{paused ? 'paused' : 'open'}</strong>. Invite links work either way.
        </p>
        {canEdit && (
          <ConfirmForm
            action={setSignupsPausedAction}
            submit={paused ? 'Resume sign-ups' : 'Pause sign-ups'}
            variant="outline"
            title={paused ? 'Resume sign-ups?' : 'Pause new sign-ups?'}
            body={paused ? 'New agencies can sign up on their own again.' : "New agencies can't sign up until you resume. Invite links still work."}
            confirmLabel={paused ? 'Resume sign-ups' : 'Pause sign-ups'}
            fields={{ paused: paused ? 'false' : 'true' }}
            className="flex flex-wrap items-center gap-2"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Sign-up funnel, last {days} days</h3>
        <nav aria-label="Funnel range" className={segmentedTrackClass}>
          {([30, 90] as const).map((d) => (
            <Link
              key={d}
              href={`/platform/billing?tab=signups&days=${d}`}
              aria-current={d === days ? 'true' : undefined}
              className={segmentedItemClass}
            >
              {d} days
            </Link>
          ))}
        </nav>
      </div>
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              {COLUMNS.map((c) => <TableHead key={c.key} numeric>{c.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {([['Open sign-up', funnel.open], ['Invite link', funnel.invite]] as const).map(([label, counts]) => (
              <TableRow key={label}>
                <TableHead scope="row" className="font-medium text-ink">{label}</TableHead>
                {COLUMNS.map((c) => <TableCell key={c.key} numeric>{counts[c.key]}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      {funnel.recent.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-ink">Newest sign-ups</h3>
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agency</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Clients today</TableHead>
                  <TableHead>Check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funnel.recent.map((r) => (
                  <TableRow key={r.agencyId}>
                    <TableHead scope="row" className="font-medium text-ink">{r.agencyName}</TableHead>
                    <TableCell>{r.website ?? '—'}</TableCell>
                    <TableCell>{r.clientsServed ? SERVED_LABEL[r.clientsServed] : '—'}</TableCell>
                    <TableCell>{r.check && <StatusChip tone="warning" title={CHECK_TIP}>Check</StatusChip>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </>
      )}
    </div>
  );
}
