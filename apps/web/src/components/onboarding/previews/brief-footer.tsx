import { Highlight } from '../highlight';

export type BriefFocus = 'agency' | 'contact' | 'address' | null;

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Step 1 preview: how the agency signs every client brief. Fixed sample brief plus the values typed so far. */
export function BriefFooter({ agency, contact, phone, email, address, focus }: { agency: string; contact: string; phone: string; email: string; address: string; focus: BriefFocus }) {
  const lines = [phone, email].filter(Boolean).join(' · ');
  return (
    <div className="px-8 py-7">
      <div className="text-xs font-medium text-muted-ink">Weekly brief</div>
      <div className="mt-1.5 text-xl font-semibold">Three things your rivals did this week</div>
      <div aria-hidden="true" className="mt-5 flex flex-col gap-3">
        {[92, 78, 85].map((w) => <div key={w} className="h-2.5 rounded-full bg-[#EEF2F6]" style={{ width: `${w}%` }} />)}
      </div>
      <div className="mt-7 flex items-center gap-3.5 border-t border-line pt-4">
        <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#EEF2F6] text-sm font-semibold">{initialsOf(contact) || '·'}</div>
        <div className="min-w-0 text-sm">
          <Highlight active={focus === 'agency'}>
            <div className="font-semibold">{[contact || 'Your name', agency || 'Your agency'].join(' · ')}</div>
          </Highlight>
          <Highlight active={focus === 'contact'}>
            <div className="text-13 text-muted-ink">{lines || '(555) 555-0100 · you@agency.com'}</div>
          </Highlight>
          <Highlight active={focus === 'address'}>
            <div className="text-13 text-muted-ink">{address || 'Your address, if you add one'}</div>
          </Highlight>
        </div>
      </div>
    </div>
  );
}
