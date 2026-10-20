import * as Sentry from '@sentry/nextjs';
import { redactForLog } from '@cs/core/server';
import { SENTRY_DATA_COLLECTION } from './src/lib/sentry-options';
import { scrubEventUrls } from './src/lib/sentry-scrub';

type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

/** Server `Sentry.init` options: no PII/bodies/cookies/query strings (`dataCollection`), plus key/email/URL scrubbing. */
export function serverSentryOptions(dsn: string, env: NodeJS.ProcessEnv = process.env) {
  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.VERCEL_ENV || env.NODE_ENV,
    tracesSampleRate: 0.1,
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeSend: (event) => scrubEventUrls(redactForLog(event) as typeof event),
    beforeSendTransaction: (event) => scrubEventUrls(redactForLog(event) as typeof event),
  } satisfies InitOptions;
}

// Inert without a DSN (local runs, unit tests and E2E all run without one). Ids-only tags are set where a request context exists.
const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) Sentry.init(serverSentryOptions(dsn));
