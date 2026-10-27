import { Highlight } from '../highlight';

export type InviteFocus = 'to' | 'role' | null;

/** Step 2 preview: the email a teammate receives. `role` is the phrase shown to the invitee ("an account manager"). */
export function InviteEmail({ agency, inviter, to, role, focus }: { agency: string; inviter: string; to: string; role: string; focus: InviteFocus }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 border-b border-line px-5 py-3.5 text-xs text-muted-ink">
        <span>From: {agency || 'Your agency'}</span>
        <span aria-hidden="true">·</span>
        <Highlight active={focus === 'to'}><span>To: {to || 'name@agency.com'}</span></Highlight>
      </div>
      <div className="px-8 py-7">
        <div className="text-base font-semibold">{agency || 'Your agency'}</div>
        <div className="mt-5 text-[19px] font-semibold">{inviter || 'A teammate'} invited you to {agency || 'your agency'}</div>
        <Highlight active={focus === 'role'}>
          <p className="mt-2.5 text-sm leading-normal text-muted-ink">You&apos;ll help run competitor tracking for our clients as {role}.</p>
        </Highlight>
        <div className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-13 font-medium text-primary-foreground">Accept invite</div>
      </div>
    </div>
  );
}
