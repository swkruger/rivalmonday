import type * as Sentry from '@sentry/nextjs';
import { scrubBrowserEvent } from './sentry-scrub';

// Browser-safe (no `@cs/core/server`): `instrumentation-client.ts` and `sentry.server.config.ts` both use it.
type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

/**
 * @sentry/* 11 replaced `sendDefaultPii` with `dataCollection`, whose defaults send user info/IP, cookies, all request
 * headers, request/response bodies and URL query strings. Turn all of that off; keep three diagnostic headers.
 * (Verified against `@sentry/core` 11.4.0 `DataCollection` / `resolveDataCollectionOptions`.) The worker keeps a copy.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['user-agent', 'content-type', 'x-vercel-id'] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
} satisfies NonNullable<InitOptions['dataCollection']>;

/** Browser `Sentry.init` options (no replay, no PII). */
export function browserSentryOptions(dsn: string, environment: string | undefined) {
  return {
    dsn,
    environment,
    tracesSampleRate: 0.1,
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeSend: (event) => scrubBrowserEvent(event),
    beforeSendTransaction: (event) => scrubBrowserEvent(event),
  } satisfies InitOptions;
}
