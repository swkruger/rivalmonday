import * as Sentry from '@sentry/nextjs';

// Browser-only error reporting (Next 16 file name). Inert without a public DSN; no replay, no tracing, no PII.
// Self-contained on purpose: the site imports no server package, so this mirrors apps/web's scrubbing in miniature.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const maskEmails = (s: string) => s.replace(EMAIL, '$1***@$2');

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0,
    // @sentry/* 11 replaced `sendDefaultPii` with `dataCollection` (defaults send IP, cookies, headers, bodies, query strings).
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false },
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
      }
      if (event.user) delete event.user.ip_address;
      for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = maskEmails(ex.value);
      if (event.message) event.message = maskEmails(event.message);
      return event;
    },
    beforeBreadcrumb: (b) => (b.category === 'ui.input' ? null : b),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
