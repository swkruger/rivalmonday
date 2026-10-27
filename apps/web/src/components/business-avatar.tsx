/** First letter of the first two words that hold a letter or digit, upper-cased; "?" when there is none. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).map((w) => w.match(/[\p{L}\p{N}]/u)?.[0]).filter((c): c is string => Boolean(c));
  return words.length ? words.slice(0, 2).join('').toUpperCase() : '?';
}

/** 16c P7: the 40 px initials tile left of a competitor's h1 (decorative; the heading names the business). */
export function BusinessAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="business-avatar"
      className="grid size-10 shrink-0 place-items-center rounded-xs border border-line bg-muted-surface text-sm font-semibold text-ink-secondary"
    >
      {initialsOf(name)}
    </span>
  );
}
