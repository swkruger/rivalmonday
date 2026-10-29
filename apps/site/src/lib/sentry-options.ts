import type * as Sentry from '@sentry/nextjs';

// Pure, browser-safe Sentry options for the marketing site (no env reads; `instrumentation-client.ts` passes them in).
// Mirrors apps/web's scrubbing in miniature: the site imports no server package.
type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type Event = Parameters<NonNullable<InitOptions['beforeSend']>>[0];
type Breadcrumb = Parameters<NonNullable<InitOptions['beforeBreadcrumb']>>[0];

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
export const maskEmails = (s: string): string => s.replace(EMAIL, '$1***@$2');
/** Drop `?query` and `#fragment` (join links, click ids, `?email=`). */
export const stripQueryHash = (s: string): string => s.replace(/[?#].*$/s, '');

function maskDeep(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return maskEmails(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, seen));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v, seen)]));
}

export function scrubEvent(event: Event): Event {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (typeof event.request.url === 'string') event.request.url = stripQueryHash(event.request.url);
  }
  if (event.user) delete event.user.ip_address;
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = maskEmails(ex.value);
  if (event.message) event.message = maskEmails(event.message);
  if (event.extra) event.extra = maskDeep(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = maskDeep(event.contexts) as typeof event.contexts;
  for (const b of event.breadcrumbs ?? []) scrubBreadcrumb(b);
  return event;
}

export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  if (b.category === 'ui.input') return null;
  if (b.message) b.message = maskEmails(b.message);
  if (b.data) {
    for (const k of ['from', 'to', 'url']) if (typeof b.data[k] === 'string') b.data[k] = stripQueryHash(b.data[k] as string);
    b.data = maskDeep(b.data) as typeof b.data;
  }
  return b;
}

/** Browser `Sentry.init` options: errors only, no replay, no tracing, no PII. */
export function siteSentryOptions(dsn: string, environment: string) {
  return {
    dsn,
    environment,
    tracesSampleRate: 0,
    // @sentry/* 11 replaced `sendDefaultPii` with `dataCollection` (defaults send IP, cookies, headers, bodies, query strings).
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false },
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
  } satisfies InitOptions;
}
