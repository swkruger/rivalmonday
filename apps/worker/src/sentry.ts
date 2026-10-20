import { readFileSync } from 'node:fs';
import * as Sentry from '@sentry/node';
import { redactForLog, type LogContext, type Logger } from '@cs/core/server';
import type { JobDefinition } from './jobs';

function releaseFile(): string | undefined {
  try {
    return readFileSync(new URL('../.release', import.meta.url), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

/**
 * Copy of apps/web `SENTRY_DATA_COLLECTION` (the worker does not depend on apps/web): @sentry/* 11 replaced
 * `sendDefaultPii` with `dataCollection`, whose defaults send user info/IP, cookies, headers, bodies and query strings.
 */
export const WORKER_DATA_COLLECTION = {
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

/** Worker events carry no HTTP request; drop one (and any user IP) if an integration ever attaches it. */
function scrubWorkerEvent<T>(event: T): T {
  const e = redactForLog(event) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (e && typeof e === 'object') {
    delete e.request;
    if (e.user && typeof e.user === 'object') delete e.user.ip_address;
  }
  return e as T;
}

export function workerSentryOptions(dsn: string, env: NodeJS.ProcessEnv) {
  return {
    dsn,
    release: env.SENTRY_RELEASE?.trim() || releaseFile() || 'dev',
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
    dataCollection: WORKER_DATA_COLLECTION,
    beforeSend: (event) => scrubWorkerEvent(event),
    beforeSendTransaction: (event) => scrubWorkerEvent(event),
  } satisfies InitOptions;
}

/** Inert (returns false) unless SENTRY_DSN is set. Release: SENTRY_RELEASE, else apps/worker/.release, else 'dev'. */
export function initWorkerSentry(env: NodeJS.ProcessEnv): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  Sentry.init(workerSentryOptions(dsn, env));
  return true;
}

/** Runs one job item in a Sentry span (and cron monitor), with a child logger; failures are captured, logged and rethrown for pg-boss retry. */
export async function runJob<T>(
  job: Pick<JobDefinition<T>, 'name' | 'cron'>,
  jobId: string,
  data: T,
  handler: (data: T) => Promise<void | Record<string, unknown>>,
  log: Logger,
): Promise<void | Record<string, unknown>> {
  const ctx: LogContext = { job: job.name, jobId };
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.agencyId === 'string') ctx.agencyId = d.agencyId;
    if (typeof d.clientId === 'string') ctx.clientId = d.clientId;
  }
  const jlog = log.child(ctx);
  const run = () =>
    Sentry.startSpan({ name: `job.${job.name}`, op: 'queue.process' }, async () => {
      try {
        return await handler(data);
      } catch (err) {
        Sentry.captureException(err, { tags: { ...ctx } as Record<string, string> });
        jlog.error({ err }, 'job failed');
        throw err;
      }
    });
  if (!job.cron) return run();
  return Sentry.withMonitor(job.name, run, { schedule: { type: 'crontab', value: job.cron }, checkinMargin: 5, maxRuntime: 30 });
}
