import * as Sentry from '@sentry/nextjs';
import { siteSentryOptions } from './src/lib/sentry-options';

// Browser-only error reporting (Next 16 file name). Inert without a public DSN; options and scrubbing: src/lib/sentry-options.ts.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) Sentry.init(siteSentryOptions(dsn, process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development'));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
