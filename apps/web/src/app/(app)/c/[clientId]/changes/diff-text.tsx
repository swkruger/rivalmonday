/**
 * Word-level diff renderer (Task 9 brief). No hooks, no `'use client'` — rendered server-side alongside the rest
 * of the evidence viewer, so it may import `CompareView` from `@cs/tools` directly.
 */
import type { CompareView } from '@cs/tools';

export function DiffText({ segments }: { segments: CompareView['diff'] }) {
  if (segments.length === 0) return <p className="text-muted-foreground">No text changes stored for this evidence.</p>;
  return (
    <p className="whitespace-pre-wrap rounded-lg bg-muted-surface p-4 font-mono text-sm leading-relaxed">
      {segments.map((s, i) =>
        s.op === 'delete' ? (
          <del key={i} aria-label={`removed: ${s.text}`} className="bg-[#FEE2E2] text-[#B91C1C]">
            {s.text}
          </del>
        ) : s.op === 'insert' ? (
          <ins key={i} aria-label={`added: ${s.text}`} className="bg-[#DCFCE7] text-[#15803D] no-underline">
            {s.text}
          </ins>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}
