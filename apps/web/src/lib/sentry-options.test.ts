import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn() }));

import { serverSentryOptions } from '../../sentry.server.config';
import { browserSentryOptions, SENTRY_DATA_COLLECTION } from './sentry-options';

// @sentry/* 11 has no `sendDefaultPii`; its `dataCollection` defaults send bodies, cookies, headers, IPs and query strings.
describe('Sentry init options', () => {
  const dsn = 'https://k@o.ingest.sentry.io/1';
  for (const [name, opts] of [
    ['web server', serverSentryOptions(dsn, {} as NodeJS.ProcessEnv)],
    ['browser', browserSentryOptions(dsn, 'test')],
  ] as const) {
    it(`${name}: data collection off`, () => {
      expect(opts.dataCollection).toBe(SENTRY_DATA_COLLECTION);
      expect(opts.dataCollection).toMatchObject({ httpBodies: [], cookies: false, userInfo: false, urlQueryParams: false });
      expect(opts.dataCollection.httpHeaders).toEqual({ request: { allow: ['user-agent', 'content-type', 'x-vercel-id'] }, response: false });
      expect(opts).not.toHaveProperty('sendDefaultPii');
    });
  }
});
