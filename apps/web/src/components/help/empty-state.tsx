'use client';
import { OPEN_PAGE_GUIDE_EVENT } from '@/help/copy';

/** A teaching empty state: what this place is for, and the next step (`action`). */
export function EmptyState({ title, body, action, guideAnchor }: { title: string; body: string; action?: React.ReactNode; guideAnchor?: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-surface p-6 text-ink">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-prose text-sm text-muted-ink">{body}</p>
      {action}
      {guideAnchor !== undefined && (
        <button
          type="button"
          className="text-sm font-medium text-secondary underline-offset-2 hover:underline"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PAGE_GUIDE_EVENT, { detail: { anchor: guideAnchor || undefined } }))}
        >
          More in the guide →
        </button>
      )}
    </div>
  );
}
