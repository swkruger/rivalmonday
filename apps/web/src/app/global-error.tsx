'use client';

import { useEffect } from 'react';
import { ERROR_TITLE, retryHandler, type ErrorBoundaryProps } from '@/components/error-boundary-page';
import { ErrorPanel } from '@/components/error-panel';
import { reportError } from '@/lib/report-error';
import './globals.css';

/** Last resort when the root layout itself fails: renders its own document, still neutral. */
export default function GlobalError({ error, retry, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, 'global');
  }, [error]);
  return (
    <html lang="en">
      <head>
        <title>{ERROR_TITLE}</title>
      </head>
      <body>
        <ErrorPanel kind="error" digest={error.digest} onRetry={retryHandler({ retry, reset })} />
      </body>
    </html>
  );
}
