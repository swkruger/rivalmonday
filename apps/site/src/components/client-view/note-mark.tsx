/** A numbered marker tying a spot in the mock window to the matching "What to notice" note below it. Decorative. */
export function NoteMark({ n }: { n: number }) {
  return (
    <span aria-hidden="true" data-note-mark={n} className="inline-flex size-6.5 shrink-0 items-center justify-center rounded-full bg-amber text-13 font-bold text-amber-text ring-4 ring-surface">
      {n}
    </span>
  );
}
