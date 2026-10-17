/** Phase 11c: shapes accepted from the URL on the public intake pages (re-checked server-side by `@cs/tools`). */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
/** `?ref=` campaign tag (same shape `submitIntake` accepts); anything else is dropped, never refused. */
export const REF_RE = /^[\w.-]{1,80}$/;

export const refParam = (v: string | string[] | undefined): string | null => (typeof v === 'string' && REF_RE.test(v) ? v : null);
