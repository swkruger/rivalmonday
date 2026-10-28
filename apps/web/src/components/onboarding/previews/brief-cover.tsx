import { Highlight } from '../highlight';

export type CoverFocus = 'business' | 'contact' | 'logo' | null;

const initialOf = (name: string) => name.trim().slice(0, 1).toUpperCase();

/**
 * Client step 1 preview: the top of every brief the client receives. `logoSrc` is a same-origin or `blob:` address of the
 * logo being chosen (or null: an initial in the agency's colour stands in).
 */
export function BriefCover({ business, contact, agency, logoSrc, focus }: { business: string; contact: string; agency: string; logoSrc: string | null; focus: CoverFocus }) {
  return (
    <div className="px-8 py-7">
      <div className="flex items-center gap-3">
        <Highlight active={focus === 'logo'}>
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt="" className="size-[42px] rounded-lg object-contain" />
          ) : (
            <div aria-hidden="true" className="flex size-[42px] items-center justify-center rounded-lg bg-primary-soft text-lg font-semibold text-primary-soft-text">{initialOf(business) || '·'}</div>
          )}
        </Highlight>
        <Highlight active={focus === 'business'}>
          <div>
            <div className="text-base font-semibold">{business || 'Your client'}</div>
            <div className="text-xs text-muted-ink">Weekly brief · every Monday</div>
          </div>
        </Highlight>
      </div>
      <div aria-hidden="true" className="mt-6 flex flex-col gap-3">
        {[92, 78, 85].map((w) => <div key={w} className="h-2.5 rounded-full bg-muted-surface" style={{ width: `${w}%` }} />)}
      </div>
      <div className="mt-7 border-t border-line pt-4 text-13 text-muted-ink">
        Prepared for{' '}
        <Highlight active={focus === 'contact'}>
          <b className="font-semibold text-ink">{contact || 'the owner'}</b>
        </Highlight>{' '}
        by {agency || 'your agency'}
      </div>
    </div>
  );
}
