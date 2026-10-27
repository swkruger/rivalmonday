import type { AdView } from '@cs/tools';
import { StatusChip } from '@cs/ui';
import { formatDate } from '@/lib/format';
import { AD_STATE, labelFor } from '@/lib/labels';

const displayUrl = (u: string) => {
  const s = u.replace(/^https?:\/\//, '');
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};

/** Decision 5: a text card — no images (vendor media URLs expire). The landing URL is shown as text, never linked. */
export function AdCard({ ad, timezone }: { ad: AdView; timezone: string }) {
  const fmt = (iso: string) => formatDate(iso, { tz: timezone });
  const state = labelFor(AD_STATE, ad.active ? 'active' : 'ended');
  const platform = ad.platform === 'meta' ? 'Meta' : 'Google';
  return (
    <article className="flex flex-col gap-2 rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground">
        <span>{platform}</span>
        {ad.format && <span>· {ad.format}</span>}
        <span>· {ad.competitorName}</span>
        <StatusChip tone={state.tone} className="ml-auto">{state.label}</StatusChip>
      </div>
      {ad.title && <h3 className="font-bold text-ink">{ad.title}</h3>}
      {ad.text && <p className="line-clamp-4 whitespace-pre-line text-sm text-ink">{ad.text}</p>}
      {ad.landingUrl && (
        <p className="truncate text-sm text-muted-foreground">
          → <span>{displayUrl(ad.landingUrl)}</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        First seen {fmt(ad.firstSeenAt)} · {ad.active ? `last seen ${fmt(ad.lastSeenAt)}` : `ended ${fmt(ad.endedAt ?? ad.lastSeenAt)}`}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
        <span className="text-muted-foreground">Targeting not disclosed (US)</span>
        {ad.libraryUrl && (
          <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-soft-text">
            View in {ad.platform === 'meta' ? 'Meta Ad Library' : 'Google Ads Transparency'}
          </a>
        )}
      </div>
    </article>
  );
}
