'use client';

import { useEffect } from 'react';
import { ErrorPanel } from '@/components/error-panel';
import { reportError } from '@/lib/report-error';

/** Shared body of the route-level `error.tsx` files: reports once, then shows the neutral panel (and a neutral tab title). */
export function ErrorBoundaryPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, 'page');
  }, [error]);
  return (
    <>
      <title>Something went wrong</title>
      <ErrorPanel kind="error" digest={error.digest} onRetry={reset} />
    </>
  );
}
