import Link from 'next/link';

const chipClass = 'rounded-full border border-line bg-surface px-3 py-1.5 text-left text-[13px] font-medium text-ink transition-colors hover:bg-muted-surface disabled:opacity-50';

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
    <ul aria-label="Starter questions" className="flex flex-wrap gap-2">
      {questions.map((q) => (
        <li key={q}>
          {hrefFor ? (
            <Link href={hrefFor(q)} className={`inline-block ${chipClass}`}>
              {q}
            </Link>
          ) : (
            <button type="button" className={chipClass} disabled={disabled} onClick={() => onPick?.(q)}>
              {q}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
