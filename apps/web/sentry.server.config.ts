import * as Sentry from '@sentry/nextjs';
import { redactForLog } from '@cs/core/server';
import { scrubEventUrls } from './src/lib/sentry-scrub';

// Inert without a DSN (local runs, unit tests and E2E all run without one). Ids-only tags are set where a request context exists.
const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEventUrls(redactForLog(event) as typeof event),
    beforeSendTransaction: (event) => scrubEventUrls(redactForLog(event) as typeof event),
  });
}
