import type { SuggestionView } from '@cs/tools';
import { Tooltip, TooltipProvider } from '@cs/ui';
import type { ReactNode } from 'react';
import { AdsIcon, ChainIcon, HotIcon, MetaIcon, ReviewsIcon, SearchesIcon, SpecialtyIcon, StarIcon } from './signal-icons';

type Signals = SuggestionView['signals'];
/** active: checked, something there; hot: worth attention; none: checked, nothing; unchecked: null, never read as 0. */
export type PillState = 'active' | 'hot' | 'none' | 'unchecked';

const STATE_CLASS: Record<PillState, string> = {
  active: 'bg-primary text-white',
  hot: 'bg-amber text-amber-text',
  none: 'bg-muted-surface text-muted-ink line-through',
  unchecked: 'border border-dotted border-muted-ink bg-transparent text-muted-ink',
};
const NOT_CHECKED = 'Not checked';

type Pill = { key: string; state: PillState; icon: ReactNode; text: string; tip: string };

const n = (v: number) => v.toLocaleString('en-US');
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

/** Pure: which pills to show for these signals, in display order. Exported for tests. */
export function buildPills(s: Signals, mode: 'suggestion' | 'tracked'): Pill[] {
  const pills: Pill[] = [];

  if (s.rating === null) pills.push({ key: 'rating', state: 'unchecked', icon: <StarIcon />, text: 'Rating', tip: NOT_CHECKED });
  else {
    pills.push({
      key: 'rating', state: 'active', icon: <StarIcon />, text: s.votes === null ? `${s.rating}` : `${s.rating} · ${n(s.votes)}`,
      tip: s.votes === null ? `${s.rating} stars` : `${s.rating} stars from ${n(s.votes)} reviews`,
    });
  }

  if (s.reviews30d === null) pills.push({ key: 'reviews', state: 'unchecked', icon: <ReviewsIcon />, text: 'Reviews 30 d', tip: NOT_CHECKED });
  else {
    const state: PillState = s.reviews30d >= 5 ? 'hot' : s.reviews30d > 0 ? 'active' : 'none';
    pills.push({ key: 'reviews', state, icon: <ReviewsIcon />, text: `${n(s.reviews30d)} reviews 30 d`, tip: `${plural(s.reviews30d, 'new review', 'new reviews')} in the last 30 days` });
  }

  if (s.googleAdsActive === null) pills.push({ key: 'google', state: 'unchecked', icon: <AdsIcon />, text: 'Google Ads', tip: NOT_CHECKED });
  else {
    const fresh = s.googleAdsNew30d;
    const state: PillState = fresh !== null && fresh > 0 ? 'hot' : s.googleAdsActive > 0 ? 'active' : 'none';
    pills.push({
      key: 'google', state, icon: <AdsIcon />, text: `Google Ads ${n(s.googleAdsActive)}`,
      tip: `${n(s.googleAdsActive)} active Google ads${fresh === null ? '' : `, ${n(fresh)} started in the last 30 days`}`,
    });
  }

  if (s.metaPage === null) pills.push({ key: 'meta', state: 'unchecked', icon: <MetaIcon />, text: 'Meta', tip: NOT_CHECKED });
  else if (s.metaPage === 'none') pills.push({ key: 'meta', state: 'none', icon: <MetaIcon />, text: 'Meta', tip: 'No Meta page found' });
  else {
    const ads = s.metaAdsActive;
    const state: PillState = ads !== null && ads > 0 ? 'hot' : 'active';
    pills.push({
      key: 'meta', state, icon: <MetaIcon />, text: ads === null ? 'Meta page' : `Meta page · ${n(ads)} ads`,
      tip: s.metaPage === 'matched' ? `Meta page found${ads === null ? '' : `, ${n(ads)} active ads`}` : 'Possible Meta page found',
    });
  }

  if (mode === 'suggestion') {
    if (s.presence === null) pills.push({ key: 'presence', state: 'unchecked', icon: <SearchesIcon />, text: 'Searches', tip: NOT_CHECKED });
    else {
      const p = s.presence;
      pills.push({
        key: 'presence', state: 'active', icon: <SearchesIcon />, text: `in ${n(p.appeared)} of ${n(p.searches)} searches`,
        tip: `Appeared in ${n(p.appeared)} of ${n(p.searches)} searches${p.bestRank === null ? '' : `, best rank #${p.bestRank}`}`,
      });
    }
  }
  if (s.chain === true) pills.push({ key: 'chain', state: 'active', icon: <ChainIcon />, text: 'Chain', tip: 'Part of a chain or franchise' });
  if (s.categoryMatch === 'related') pills.push({ key: 'related', state: 'active', icon: <SpecialtyIcon />, text: 'Different specialty', tip: 'Different specialty' });
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
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary ${STATE_CLASS[p.state]}`}
            >
              {p.state === 'hot' && <HotIcon />}
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
