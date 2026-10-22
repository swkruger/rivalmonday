'use client';

import { useEffect } from 'react';
import { ErrorPanel } from '@/components/error-panel';
import { reportError } from '@/lib/report-error';

export const ERROR_TITLE = 'Something went wrong';

/** Props Next passes to an `error.tsx` / `global-error.tsx` boundary. `retry` (Next 16.3) re-fetches; `reset` only re-renders. */
export type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
};

/** "Try again": prefer `retry` (re-fetches, so a Server Component crash can recover), else `reset`. */
export function retryHandler({ retry, reset }: Pick<ErrorBoundaryProps, 'retry' | 'reset'>): (() => void) | undefined {
  return retry ?? reset;
}

/**
 * Keeps the tab title neutral while the boundary is shown. The React `<title>` alone can lose to the layout's streamed
 * metadata title, so the title is also set imperatively and re-applied if the head changes. On unmount the previous
 * title comes back only if nothing replaced ours meanwhile.
 */
export function useErrorTitle() {
  useEffect(() => {
    const previous = document.title;
    const apply = () => {
      if (document.title !== ERROR_TITLE) document.title = ERROR_TITLE;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (document.title === ERROR_TITLE && previous !== ERROR_TITLE) document.title = previous;
    };
  }, []);
}

/** Shared body of the route-level `error.tsx` files: reports once, then shows the neutral panel (and a neutral tab title). */
export function ErrorBoundaryPage({ error, retry, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, 'page');
  }, [error]);
  useErrorTitle();
  return (
    <>
      <title>{ERROR_TITLE}</title>
      <ErrorPanel kind="error" digest={error.digest} onRetry={retryHandler({ retry, reset })} />
    </>
  );
}
