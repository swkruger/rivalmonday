'use client';

import { useEffect } from 'react';
import { ErrorPanel } from '@/components/error-panel';
import { reportError } from '@/lib/report-error';
import './globals.css';

/** Last resort when the root layout itself fails: renders its own document, still neutral. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, 'global');
  }, [error]);
  return (
    <html lang="en">
      <head>
        <title>Something went wrong</title>
      </head>
      <body>
        <ErrorPanel kind="error" digest={error.digest} onRetry={reset} />
      </body>
    </html>
  );
}
