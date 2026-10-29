import { Star } from 'lucide-react';
import { formatDay } from '../../sample/format';
import type { SampleEvidence } from '../../sample/schema';

/** "Reviewer A" → "RA": reviewers ship as labels only (P3), so the avatar is two letters. */
const initials = (author: string) => author.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join('').slice(0, 2);

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span role="img" aria-label={`${rating} out of 5`} className="inline-flex gap-0.5 text-secondary">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden="true" className={i < full ? 'size-3.5 fill-current' : 'size-3.5 text-line-control'} />
      ))}
    </span>
  );
}

/** Reviews in the item's window, newest first, as captured text. */
export function ReviewsView({ ev }: { ev: Extract<SampleEvidence, { kind: 'reviews' }> }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-ink">{`${formatDay(ev.from)} – ${formatDay(ev.to)}`}</p>
      <ul className="flex flex-col divide-y divide-line">
        {ev.reviews.map((r, i) => (
          <li key={i} className="flex gap-3 py-3 first:pt-0">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted-surface text-xs font-semibold text-ink-secondary">
              {initials(r.author)}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="sr-only">{r.author}</span>
                <Stars rating={r.rating} />
                <span className="text-xs text-muted-ink">{formatDay(r.date)}</span>
              </div>
              <p className="text-sm text-ink">{r.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
