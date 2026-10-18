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
