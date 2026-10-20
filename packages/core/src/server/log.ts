import { createRequire } from 'node:module';
import pino from 'pino';

export interface LogContext { requestId?: string; job?: string; jobId?: string; agencyId?: string; clientId?: string; role?: string }
type LogFn = (o: object | string, msg?: string) => void;
export interface Logger { debug: LogFn; info: LogFn; warn: LogFn; error: LogFn; child(ctx: LogContext): Logger }

const SECRET_KEY = /token|secret|key|password|passwd|authorization|cookie|signature/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const DROP_KEYS = /^(prompt|messages|completion|output|body|text|reviewText|content|html)$/i;

/** Log-safe copy of `value`: secret-like keys redacted, free-text keys dropped to a length, emails masked, cycles cut. */
export function redactForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return value.replace(EMAIL, '$1***@$2');
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: redactForLog(value.message, seen), stack: redactForLog(value.stack, seen),
    ...(value.cause !== undefined ? { cause: redactForLog(value.cause, seen) } : {}) };
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k)) out[k] = '[redacted]';
    else if (DROP_KEYS.test(k)) out[k] = typeof v === 'string' ? `[dropped ${v.length} chars]` : '[dropped]';
    else out[k] = redactForLog(v, seen);
  }
  return out;
}

function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function createLogger(opts: { level?: string; pretty?: boolean; destination?: NodeJS.WritableStream } = {}): Logger {
  const level = opts.level ?? process.env.LOG_LEVEL ?? 'info';
  const pretty = opts.pretty ?? (process.env.NODE_ENV !== 'production' && prettyAvailable());
  const options: pino.LoggerOptions = {
    level,
    // Every object (including `err`) goes through redactForLog before pino serialises it.
    formatters: { log: (o) => redactForLog(o) as Record<string, unknown> },
    serializers: { err: (e) => redactForLog(e) },
  };
  let root: pino.Logger;
  if (opts.destination) root = pino(options, opts.destination as pino.DestinationStream);
  else if (pretty && prettyAvailable()) root = pino({ ...options, transport: { target: 'pino-pretty', options: { colorize: true } } });
  else root = pino(options);
  return wrap(root);
}

function wrap(p: pino.Logger): Logger {
  const fn = (level: 'debug' | 'info' | 'warn' | 'error'): LogFn => (o, msg) => {
    if (typeof o === 'string') p[level](o);
    else p[level](o, msg);
  };
  return { debug: fn('debug'), info: fn('info'), warn: fn('warn'), error: fn('error'), child: (ctx) => wrap(p.child(redactForLog(ctx) as object)) };
}
