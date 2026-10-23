import Link from 'next/link';

const linkCls = 'font-semibold text-primary-soft-text hover:underline';

/** "‹ Previous" / "Next ›" between neighbouring briefs, alerts or reports (15a §2.8); a missing end hides its link. */
export function PrevNext({ previous, next }: { previous: string | null; next: string | null }) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Previous and next" className="flex items-center justify-between gap-3 text-sm">
      {previous ? <Link href={previous} className={linkCls}>‹ Previous</Link> : <span />}
      {next && <Link href={next} className={linkCls}>Next ›</Link>}
    </nav>
  );
}

/**
 * A paged list whose page came back empty although the list is not (a stale cursor, or the last items on it were
 * handled): say so and link to the first page, instead of the list's "nothing here at all" empty state.
 */
export function OffPageNotice({ firstHref }: { firstHref: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      Nothing on this page. <Link href={firstHref} className={linkCls}>Go to the first page</Link>
    </p>
  );
}
