import * as Sentry from '@sentry/nextjs';
import { browserSentryOptions } from '@/lib/sentry-options';

// Browser init (Next 16 file name). Inert without a public DSN; no replay, no PII. Must not import `@cs/core/server`.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) Sentry.init(browserSentryOptions(dsn, process.env.NODE_ENV));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
