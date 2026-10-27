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
        <h3 className="text-sm font-semibold text-muted-foreground">Sign-up funnel, last {days} days</h3>
        <nav aria-label="Funnel range" className="inline-flex gap-1 rounded-full bg-[#EEF2F6] p-1 text-sm">
          {([30, 90] as const).map((d) => (
            <Link
              key={d}
              href={`/platform/billing?tab=signups&days=${d}`}
              aria-current={d === days ? 'true' : undefined}
              className={`rounded-full px-3 py-1 font-semibold ${d === days ? 'border border-line bg-surface text-secondary' : 'border border-transparent text-ink'}`}
            >
              {d} days
            </Link>
          ))}
        </nav>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-semibold">Source</th>
              {COLUMNS.map((c) => <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {([['Open sign-up', funnel.open], ['Invite link', funnel.invite]] as const).map(([label, counts]) => (
              <tr key={label} className="border-t border-[#EEF2F6]">
                <th scope="row" className="px-3 py-2 font-medium">{label}</th>
                {COLUMNS.map((c) => <td key={c.key} className="px-3 py-2 text-lg font-semibold text-secondary">{counts[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
