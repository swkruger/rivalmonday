/** The one `<h1>`: the lead, then the mark on the canvas's hand-drawn amber underline (spec D14). */
export function HeroHeadline({ headline }: { headline: { lead: string; mark: string } }) {
  return (
    <h1 className="mt-6 max-w-[11.5em] text-balance text-display font-bold text-surface">
      {headline.lead}{' '}
      <span className="relative inline-block whitespace-nowrap text-amber">
        {headline.mark}
        <svg aria-hidden="true" viewBox="0 0 300 18" preserveAspectRatio="none" fill="none" className="absolute -bottom-[0.12em] left-[2%] h-[0.2em] w-[96%] stroke-amber">
          <path d="M4 12C70 4 180 2 296 9" strokeWidth="5" strokeLinecap="round" />
        </svg>
      </span>
    </h1>
  );
}
