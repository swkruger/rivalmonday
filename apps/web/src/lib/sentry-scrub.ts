// Browser-safe twin of `redactForLog` (@cs/core/server pulls in node-only code and must not reach the client bundle).
// `sentry-scrub.test.ts` runs both over shared fixtures; change them together.
const SECRET_KEY = /token|secret|key|password|passwd|authorization|cookie|signature/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const DROP_KEYS = /^(prompt|messages|completion|output|body|text|reviewText|content|html)$/i;

export function scrubEvent(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return value.replace(EMAIL, '$1***@$2');
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: scrubEvent(value.message, seen), stack: scrubEvent(value.stack, seen),
    ...(value.cause !== undefined ? { cause: scrubEvent(value.cause, seen) } : {}) };
  if (Array.isArray(value)) return value.map((v) => scrubEvent(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k)) out[k] = '[redacted]';
    else if (DROP_KEYS.test(k)) out[k] = typeof v === 'string' ? `[dropped ${v.length} chars]` : '[dropped]';
    else out[k] = scrubEvent(v, seen);
  }
  return out;
}

// ---- URL hygiene (shared by the server and browser Sentry hooks) ----
// Routes whose PATH carries a secret or one-shot id: guest links `/l/<token>`, unsubscribe `/u/<token>[/confirm|/done]`, invites `/join/<token>`, sign-up
// verification `/start/verify/<token>` and `/start/v/<leadId>`, dev sign-in. Keep in step with `src/app`.
const SECRET_PATH = /(^|\s|:\/\/[^/\s]*)(\/(?:l|u|join|start\/verify|start\/v|dev-panel\/sign-in))\/[^/?#\s]+/g;

/** Drop `?query` and `#fragment` and mask secret path segments. Safe on absolute URLs, paths and "GET /path" names. */
export function scrubUrl(value: string): string {
  if (!/^(\/|https?:|[A-Z]+ \/)/.test(value)) return value; // not a URL/path (e.g. a SQL span with `?` placeholders)
  return value.replace(/[?#]\S*/g, '').replace(SECRET_PATH, '$1$2/[redacted]');
}

const URL_KEYS = ['url', 'from', 'to', 'http.url', 'url.full', 'http.target'];

function scrubUrlFields(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  const o = obj as Record<string, unknown>;
  for (const k of URL_KEYS) if (typeof o[k] === 'string') o[k] = scrubUrl(o[k]);
}

/** Scrub URL-valued fields of an (already key/email-redacted) Sentry event, in place on that copy. */
export function scrubEventUrls<T>(event: T): T {
  if (!event || typeof event !== 'object') return event;
  const e = event as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (e.request && typeof e.request === 'object') {
    delete e.request.query_string;
    delete e.request.cookies;
    scrubUrlFields(e.request);
  }
  for (const key of ['transaction', 'description']) if (typeof e[key] === 'string') e[key] = scrubUrl(e[key]);
  for (const b of Array.isArray(e.breadcrumbs) ? e.breadcrumbs : []) scrubUrlFields(b?.data);
  for (const s of Array.isArray(e.spans) ? e.spans : []) {
    if (typeof s?.description === 'string') s.description = scrubUrl(s.description);
    scrubUrlFields(s?.data);
  }
  scrubUrlFields(e.contexts?.trace?.data);
  return event;
}

/** Browser `beforeSend` / `beforeSendTransaction`. */
export const scrubBrowserEvent = <T>(event: T): T => scrubEventUrls(scrubEvent(event) as T);
