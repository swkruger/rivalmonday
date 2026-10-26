import { readableTextOn } from '@cs/ui';
import { Highlight } from '../highlight';

export type BrandFocus = 'logo' | 'color' | 'name' | null;

/**
 * Step 3 preview: the client dashboard in the agency's logo and colours. `color` is already validated by the caller
 * (`resolveBranding`), `logoSrc` is https, a same-origin logo path, or null.
 */
export function BrandedDashboard({ name, logoSrc, color, focus }: { name: string; logoSrc: string | null; color: string; focus: BrandFocus }) {
  const on = readableTextOn(color);
  return (
    <div className="grid h-[380px] grid-cols-[150px_1fr]">
      <Highlight active={focus !== null}>
        <div className="h-full p-4 text-xs" style={{ background: color, color: on }}>
          <div data-testid="preview-dashboard-header" className="flex items-center gap-2 text-[13px] font-semibold">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt={name} className="h-[22px] w-auto max-w-[110px]" />
            ) : (
              <>
                <span aria-hidden="true" className="inline-flex size-[22px] items-center justify-center rounded-sm bg-white text-xs" style={{ color }}>{name.slice(0, 1).toUpperCase()}</span>
                <span className="truncate">{name}</span>
              </>
            )}
          </div>
          <div aria-hidden="true" className="mt-5 flex flex-col gap-3 opacity-90"><span>Overview</span><span>Competitors</span><span>Changes</span><span>Rankings</span><span>Briefs</span></div>
        </div>
      </Highlight>
      <div className="px-5 py-5">
        <div className="text-base font-semibold">Overview</div>
        <div className="mt-3.5 grid grid-cols-3 gap-2.5">
          {[['Your rating', '4.7'], ['Rival moves', '6'], ['Map rank', '#3']].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line p-2.5"><div className="text-[11px] text-muted-ink">{k}</div><div className="text-xl font-semibold">{v}</div></div>
          ))}
        </div>
        <div aria-hidden="true" className="mt-4 flex flex-col gap-2">
          {[90, 70, 80].map((w) => <div key={w} className="h-2.5 rounded-full bg-[#EEF2F6]" style={{ width: `${w}%` }} />)}
        </div>
        <div className="mt-5 inline-flex h-8 items-center rounded-md px-3.5 text-xs font-medium" style={{ background: color, color: on }}>Open this week&apos;s brief</div>
      </div>
    </div>
  );
}
