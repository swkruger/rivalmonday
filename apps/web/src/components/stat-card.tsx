import Link from 'next/link';

export interface StatPill {
  text: string;
  tone: 'up' | 'down' | 'warn' | 'info';
  /** Decorative arrow (hidden from assistive tech); `srLabel` is its spoken equivalent. */
  glyph?: string;
  srLabel?: string;
}

const TONE: Record<StatPill['tone'], string> = {
  up: 'bg-[#DCFCE7] text-[#15803D]',
  down: 'bg-[#FEE2E2] text-[#B91C1C]',
  warn: 'bg-[#FFF3DC] text-[#B45309]',
  info: 'bg-primary-soft text-primary-soft-text',
};

/**
 * Overview KPI card (mockup 01): title (an h2 under the page's h1), big number, optional tone pill, quiet hint. `help` (15b): a
 * `HelpTip` beside the title. `href` (15c-2a): the whole card is a link, with a hover state and an arrow so it reads as clickable (design system v1: border,
 * not shadow; the plain card keeps its pre-v1 look until the central migration). Padding is `p-4 sm:p-6` so tiles fit at 390 px.
 */
export function StatCard({ title, value, pill, hint, help, href }: { title: string; value: string; pill?: StatPill | null; hint?: string; help?: React.ReactNode; href?: string }) {
  const body = (
    <>
      {help ? (
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
          {help}
        </div>
      ) : (
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[34px] font-extrabold text-secondary">{value}</span>
        {pill && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[pill.tone]}`}>{pill.glyph && <span aria-hidden="true">{pill.glyph} </span>}{pill.srLabel && <span className="sr-only">{pill.srLabel} </span>}{pill.text}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="group relative block rounded-md border border-line bg-surface p-4 hover:border-secondary hover:bg-muted-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-6">
        {body}
        <span aria-hidden="true" className="absolute right-4 top-4 text-muted-foreground group-hover:text-secondary">→</span>
      </Link>
    );
  }
  return <div className="rounded-[14px] bg-surface p-4 shadow-card sm:p-6">{body}</div>;
}
