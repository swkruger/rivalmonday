/**
 * Word-level diff renderer (Task 9 brief). No hooks, no `'use client'` — rendered server-side alongside the rest
 * of the evidence viewer, so it may import `CompareView` from `@cs/tools` directly.
 */
import type { CompareView } from '@cs/tools';

export function DiffText({ segments }: { segments: CompareView['diff'] }) {
  if (segments.length === 0) return <p className="text-muted-ink">No text changes stored for this evidence.</p>;
  return (
    <p className="whitespace-pre-wrap rounded-md bg-muted-surface p-4 font-mono text-sm leading-relaxed">
      {segments.map((s, i) =>
        s.op === 'delete' ? (
          <del key={i} aria-label={`removed: ${s.text}`} className="bg-chip-danger-bg text-chip-danger-text">
            {s.text}
          </del>
        ) : s.op === 'insert' ? (
          <ins key={i} aria-label={`added: ${s.text}`} className="bg-chip-success-bg text-chip-success-text no-underline">
            {s.text}
          </ins>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}
