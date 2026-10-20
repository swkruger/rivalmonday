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
