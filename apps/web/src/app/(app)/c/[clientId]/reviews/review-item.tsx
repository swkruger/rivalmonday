import type { ReviewView } from '@cs/tools';
import { Band } from '@cs/ui';
import { formatDate } from '@/lib/format';

/** Decision 6: text as published; the reviewer is always "Google reviewer". */
export function ReviewItem({ review, timezone }: { review: ReviewView; timezone: string }) {
  const meta = ['Google reviewer', review.self ? 'on your profile' : review.name, ...(review.postedAt ? [formatDate(review.postedAt, { tz: timezone })] : [])].join(' · ');
  return (
    <article className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {review.rating !== null && (
          <span aria-label={`${review.rating} of 5 stars`} className="tracking-tight text-accent-text">
            {'★'.repeat(review.rating)}
            <span className="text-muted-surface-2">{'★'.repeat(5 - review.rating)}</span>
          </span>
        )}
        <span className="text-xs text-muted-foreground">{meta}</span>
      </div>
      {review.text ? <p className="whitespace-pre-line text-sm text-ink">{review.text}</p> : <p className="text-sm text-muted-foreground">No written review.</p>}
      {review.topics.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {review.topics.map((t) => <li key={t.id} className="rounded-xs bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-text">{t.name}</li>)}
        </ul>
      )}
      {review.ownerAnswer && <Band tone="muted" className="text-xs text-ink">Owner replied: {review.ownerAnswer}</Band>}
    </article>
  );
}
