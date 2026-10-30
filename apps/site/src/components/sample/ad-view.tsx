import { formatDay } from '../../sample/format';
import type { SampleEvidence } from '../../sample/schema';

/**
 * Illustrative creatives for the sample's ads (generated once, no text, people or brands; served from
 * `public/sample`), matched on the ad's headline so a re-export keeps the right picture. No match → no image.
 */
const CREATIVES: { test: RegExp; src: string; alt: string }[] = [
  { test: /financ/i, src: '/sample/ad-financing.webp', alt: 'A new outdoor air conditioning unit beside a house' },
  { test: /club|tune-?up/i, src: '/sample/ad-comfort-club.webp', alt: 'A bright living room with a wall thermostat' },
];

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** The ad as it ran: advertiser line, copy, creative and headline bar, then when it was first seen. */
export function AdView({ ev, advertiser }: { ev: Extract<SampleEvidence, { kind: 'ad' }>; advertiser: string }) {
  const creative = CREATIVES.find((c) => c.test.test(ev.headline));
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-muted-surface text-xs font-semibold text-ink">{initials(advertiser)}</span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-13 font-semibold text-ink">{advertiser}</p>
            <p className="text-xs text-muted-ink">Sponsored</p>
          </div>
        </div>
        <p className="px-3 pb-3 text-sm text-ink">{ev.body}</p>
        {creative && (
          <img src={creative.src} alt={creative.alt} width={720} height={480} loading="lazy" decoding="async" className="aspect-[3/2] w-full bg-muted-surface object-cover" />
        )}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-canvas px-3 py-2.5">
          <p className="min-w-0 text-sm font-semibold text-ink">{ev.headline}</p>
          <span aria-hidden="true" className="shrink-0 rounded-xs bg-muted-surface-2 px-2.5 py-1 text-xs font-medium text-ink">Learn more</span>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-ink">Platform</dt>
        <dd className="text-ink">{ev.platform === 'google' ? 'Google Ads' : 'Meta (Facebook and Instagram)'}</dd>
        <dt className="text-muted-ink">First seen</dt>
        <dd className="text-ink">{formatDay(ev.firstSeen)}</dd>
      </dl>
    </div>
  );
}
