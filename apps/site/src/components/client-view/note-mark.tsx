/** A numbered marker tying a spot in the mock window to the matching "What to notice" note below it. Decorative. */
export function NoteMark({ n }: { n: number }) {
  return (
    <span aria-hidden="true" data-note-mark={n} className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-surface ring-2 ring-surface">
      {n}
    </span>
  );
}
