import { segmentedItemClass, segmentedTrackClass, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { ConfirmForm } from '@/components/confirm-form';
import { setSignupsPausedAction } from './actions';

export interface FunnelCounts { signups: number; profileDone: number; firstClient: number; cardAdded: number }
export interface SignupFunnel { open: FunnelCounts; invite: FunnelCounts }
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
                <TableCell className="font-medium">{label}</TableCell>
                {COLUMNS.map((c) => <TableCell key={c.key} numeric>{counts[c.key]}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </div>
  );
}
