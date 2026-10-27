import { Highlight } from '../highlight';

/** Client step 5 preview: the invite the owner receives, in the agency's brand. `rivals` are the competitors picked in step 4 (up to three are named). */
export function OwnerInviteEmail({ agency, to, firstName, client, rivals, focus }: { agency: string; to: string; firstName: string; client: string; rivals: string[]; focus: boolean }) {
  const named = rivals.slice(0, 3);
  const list = named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}` : (named[0] ?? '');
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 border-b border-line px-5 py-3.5 text-xs text-muted-ink">
        <span>From: {agency || 'Your agency'}</span>
        <span aria-hidden="true">·</span>
        <Highlight active={focus}><span>To: {to || 'owner@business.com'}</span></Highlight>
      </div>
      <div className="px-8 py-7">
        <div className="flex items-center gap-2.5 text-base font-semibold">
          <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">{(agency || '·').slice(0, 1).toUpperCase()}</span>
          {agency || 'Your agency'}
        </div>
        <div className="mt-5 text-[19px] font-semibold">Hi {firstName || 'there'}, your competitor dashboard is ready</div>
        <p className="mt-2.5 text-sm leading-normal text-muted-ink">
          {agency || 'Your agency'} is watching {list || 'your competitors'} for {client || 'your business'}. Your first brief arrives on a Monday.
        </p>
        <div className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-13 font-medium text-primary-foreground">Open your dashboard</div>
      </div>
    </div>
  );
}
