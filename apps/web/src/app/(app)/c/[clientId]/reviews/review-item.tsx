import type { ReviewView } from '@cs/tools';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Decision 6: text as published; the reviewer is always "Google reviewer". */
export function ReviewItem({ review }: { review: ReviewView }) {
  const meta = ['Google reviewer', review.self ? 'You' : review.name, ...(review.postedAt ? [fmt(review.postedAt)] : [])].join(' · ');
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
      {review.themes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {review.themes.map((t) => <li key={t.id} className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-text">{t.name}</li>)}
        </ul>
      )}
      {review.ownerAnswer && <p className="rounded-md bg-muted-surface p-2 text-xs text-ink">Owner replied: {review.ownerAnswer}</p>}
    </article>
  );
}
