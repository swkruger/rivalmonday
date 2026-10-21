'use client';
import { type HelpAudience, visibleAudiences } from '@cs/core';
import type { EmptyKey } from '@/help/copy';
import { OPEN_PAGE_GUIDE_EVENT, renderCopy } from '@/help/render';
import { useEmptyCopy, useHelp, usePageGuideAvailable } from './help-context';

/**
 * An `EmptyState` whose copy a client component reads by key (`<page key>.<id>`) from the shell's `HelpProvider`, so the
 * copy never sits in the client bundle (final review I1). Renders nothing when the copy is not for this viewer.
 */
export function HelpEmpty({ id, action, guideAnchor }: { id: EmptyKey; action?: React.ReactNode; guideAnchor?: string }) {
  const copy = useEmptyCopy(id);
  return copy ? <EmptyState {...copy} action={action} guideAnchor={guideAnchor} /> : null;
}

/**
 * A teaching empty state: what this place is for, and the next step (`action`). `title` and `body` may carry the short-copy
 * placeholders (`{client}`, `{agency}`, `{assistant}`), filled with the viewer's names. "More in the guide" shows only
 * when `guideAnchor` is set and the page has a guide for this viewer. `audience` (default `all`) hides the empty state
 * from viewers outside it, like a tip's audience.
 */
export function EmptyState({ title, body, action, guideAnchor, audience = 'all' }: { title: string; body: string; action?: React.ReactNode; guideAnchor?: string; audience?: HelpAudience }) {
  const { names, audience: viewer } = useHelp();
  const guide = usePageGuideAvailable();
  if (!visibleAudiences(viewer).includes(audience)) return null;
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-surface p-6 text-ink">
      <h3 className="text-base font-semibold">{renderCopy(title, names, viewer)}</h3>
      <p className="max-w-prose text-sm text-muted-ink">{renderCopy(body, names, viewer)}</p>
      {action}
      {guideAnchor !== undefined && guide && (
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
