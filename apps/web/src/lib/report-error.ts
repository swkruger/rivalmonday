import * as Sentry from '@sentry/nextjs';

/**
 * Error reporting seam for the `error.tsx` / `global-error.tsx` boundaries (signature frozen). Captures to Sentry with a
 * `where` tag; scrubbing comes from the browser `Sentry.init` options (`sentry-options.ts`), and without a DSN the capture
 * is a no-op. An error with a `digest` came from the server, where `instrumentation.ts` `onRequestError` already captured
 * the full error, so the boundary leaves it alone (one report per crash). Dev keeps the console line.
 */
export function reportError(error: Error & { digest?: string }, where: 'page' | 'global'): void {
  if (process.env.NODE_ENV !== 'production') console.error('[app-error]', where, error.digest ?? '', error);
  if (error.digest) return;
  try {
    Sentry.captureException(error, { tags: { where } });
  } catch {
    // reporting must never break the error page
  }
}
