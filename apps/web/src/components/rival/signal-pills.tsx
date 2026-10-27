import type { SuggestionView } from '@cs/tools';
import { Tooltip, TooltipProvider } from '@cs/ui';
import type { ReactNode } from 'react';
import { formatCount } from '@/lib/format';
import { StarIcon } from './signal-icons';

type Signals = SuggestionView['signals'];
/** active: checked, something there; hot: worth attention; none: checked, nothing; unchecked: null, never read as 0. */
export type PillState = 'active' | 'hot' | 'none' | 'unchecked';

/** Rect badges (design system v1 status grammar): active = soft primary, hot = soft warning (not orange); "none" is plain text, "not checked" a dashed outline. */
const STATE_CLASS: Record<PillState, string> = {
  active: 'h-5 rounded-xs bg-primary-soft px-1.5 font-medium text-primary-soft-text',
  hot: 'h-5 rounded-xs bg-chip-warning-bg px-1.5 font-medium text-chip-warning-text',
  none: 'px-1 font-medium text-muted-ink',
  unchecked: 'h-5 rounded-xs border border-dashed border-line-control px-1.5 text-muted-ink',
};
const NOT_CHECKED = 'Not checked';

type Pill = { key: string; state: PillState; icon?: ReactNode; text: string; tip: string };

const n = formatCount;
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;
const unchecked = (key: string, label: string): Pill => ({ key, state: 'unchecked', text: `${label} · not checked`, tip: NOT_CHECKED });

/** Pure: which pills to show for these signals, in display order. Exported for tests. */
export function buildPills(s: Signals, mode: 'suggestion' | 'tracked'): Pill[] {
  const pills: Pill[] = [];

  if (s.rating === null) pills.push(unchecked('rating', 'Rating'));
  else {
    pills.push({
      key: 'rating', state: 'active', icon: <StarIcon />, text: s.votes === null ? `${s.rating}` : `${s.rating} · ${n(s.votes)}`,
      tip: s.votes === null ? `${s.rating} stars` : `${s.rating} stars from ${n(s.votes)} reviews`,
    });
  }

  if (s.reviews30d === null) pills.push(unchecked('reviews', 'Reviews'));
  else {
    const tip = `${plural(s.reviews30d, 'new review', 'new reviews')} in the last 30 days`;
    if (s.reviews30d === 0) pills.push({ key: 'reviews', state: 'none', text: 'No new reviews', tip });
    else pills.push({ key: 'reviews', state: s.reviews30d >= 5 ? 'hot' : 'active', text: `${plural(s.reviews30d, 'review', 'reviews')} · 30 d`, tip });
  }

  if (s.googleAdsActive === null) pills.push(unchecked('google', 'Google ads'));
  else {
    const fresh = s.googleAdsNew30d;
    const tip = `${n(s.googleAdsActive)} active Google ads${fresh === null ? '' : `, ${n(fresh)} started in the last 30 days`}`;
    if (s.googleAdsActive === 0 && !(fresh !== null && fresh > 0)) pills.push({ key: 'google', state: 'none', text: 'No Google ads', tip });
    else pills.push({ key: 'google', state: fresh !== null && fresh > 0 ? 'hot' : 'active', text: `Google ads · ${n(s.googleAdsActive)}`, tip });
  }

  if (s.metaPage === null) pills.push(unchecked('meta', 'Meta'));
  else if (s.metaPage === 'none') pills.push({ key: 'meta', state: 'none', text: 'No Meta ads', tip: 'No active Meta ads found' });
  else {
    const ads = s.metaAdsActive;
    const found = s.metaPage === 'matched' ? `Meta page found${ads === null ? '' : `, ${n(ads)} active ads`}` : 'Possible Meta page found';
    pills.push(ads !== null && ads > 0 ? { key: 'meta', state: 'hot', text: `Meta · ${n(ads)} ads`, tip: found } : { key: 'meta', state: 'active', text: 'Meta page', tip: found });
  }

  if (mode === 'suggestion') {
    if (s.presence === null) pills.push(unchecked('presence', 'Searches'));
    else {
      const p = s.presence;
      pills.push({
        key: 'presence', state: 'active', text: `${n(p.appeared)} of ${n(p.searches)} searches`,
        tip: `Appeared in ${n(p.appeared)} of ${n(p.searches)} searches${p.bestRank === null ? '' : `, best rank #${p.bestRank}`}`,
      });
    }
  }
  if (s.chain === true) pills.push({ key: 'chain', state: 'active', text: 'Chain', tip: 'Part of a chain or franchise' });
  if (s.categoryMatch === 'related') pills.push({ key: 'related', state: 'active', text: 'Different specialty', tip: 'Different specialty' });
  // Hot is not colour-only: the tooltip and accessible name say so, and the pill gets an arrow glyph.
  return pills.map((p) => (p.state === 'hot' ? { ...p, tip: `${p.tip} · new activity` } : p));
}

export function SignalPills({ signals, mode }: { signals: Signals; mode: 'suggestion' | 'tracked' }) {
  return (
    <TooltipProvider delayDuration={150}>
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Signals">
      {buildPills(signals, mode).map((p) => (
        <li key={p.key}>
          <Tooltip content={p.tip}>
            <span
              tabIndex={0}
              role="img"
              aria-label={`${p.text}. ${p.tip}`}
              data-state={p.state}
              className={`inline-flex items-center gap-1 text-xs whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${STATE_CLASS[p.state]}`}
            >
              {p.state === 'hot' && <span aria-hidden="true">↑</span>}
              {p.icon}
              {p.text}
            </span>
          </Tooltip>
        </li>
      ))}
    </ul>
    </TooltipProvider>
  );
}
