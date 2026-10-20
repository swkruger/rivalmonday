import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/sentry-scrub';

// Browser init (Next 16 file name). Inert without a public DSN; no replay, no PII. Must not import `@cs/core/server`.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event) as typeof event,
    beforeSendTransaction: (event) => scrubEvent(event) as typeof event,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
