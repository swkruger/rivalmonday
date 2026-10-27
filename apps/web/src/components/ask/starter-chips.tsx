import Link from 'next/link';

const rowClass = 'flex w-full items-baseline gap-2 text-left hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const arrow = <span aria-hidden>↳</span>;

/**
 * Starter questions (`get_ask_starters`). In the chat a chip sends its question (`onPick`); elsewhere (Overview card,
 * Task 10) it links to the Ask page (`hrefFor`). No `'use client'` — the link form renders on the server.
 */
export function StarterChips({ questions, onPick, hrefFor, disabled = false }: {
  questions: readonly string[];
  onPick?: (question: string) => void;
  hrefFor?: (question: string) => string;
  disabled?: boolean;
}) {
  if (questions.length === 0) return null;
  return (
    <ul aria-label="Starter questions" className="m-0 flex list-none flex-col p-0">
      {questions.map((q) => (
        <li key={q} className="border-t border-line py-2.5 text-13 text-ink-secondary">
          {hrefFor ? (
            <Link href={hrefFor(q)} className={rowClass}>
              {arrow}
              {q}
            </Link>
          ) : (
            <button type="button" className={rowClass} disabled={disabled} onClick={() => onPick?.(q)}>
              {arrow}
              {q}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
