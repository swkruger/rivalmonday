import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent, siteSentryOptions } from './sentry-options';

describe('site Sentry scrubbing', () => {
  it('removes body, cookies, query string and IP; strips query+hash from request.url', () => {
    const e = scrubEvent({
      request: { url: 'https://rivalmonday.com/pricing?join=1&email=a@b.com#join', data: 'x', cookies: { a: '1' }, query_string: 'join=1' },
      user: { ip_address: '1.2.3.4', id: 'u' },
    } as never) as never as { request: Record<string, unknown>; user: Record<string, unknown> };
    expect(e.request).toEqual({ url: 'https://rivalmonday.com/pricing' });
    expect(e.user.ip_address).toBeUndefined();
  });
  it('strips query+hash from navigation/fetch/xhr breadcrumbs', () => {
    const nav = scrubBreadcrumb({ category: 'navigation', data: { from: '/a?x=1', to: '/b#join' } })!;
    expect(nav.data).toEqual({ from: '/a', to: '/b' });
    const f = scrubBreadcrumb({ category: 'fetch', data: { url: 'https://rivalmonday.app/api/waitlist?t=1', method: 'POST' } })!;
    expect(f.data).toEqual({ url: 'https://rivalmonday.app/api/waitlist', method: 'POST' });
  });
  it('drops ui.input breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'ui.input', message: 'input' })).toBeNull();
  });
  it('masks emails in exception, message, breadcrumb and extra/contexts', () => {
    const e = scrubEvent({
      message: 'failed for jane.doe@example.com',
      exception: { values: [{ value: 'bad bob@acme.io' }] },
      extra: { who: 'carol@x.org', nested: ['dave@y.net'] },
      contexts: { c: { v: 'erin@z.com' } },
      breadcrumbs: [{ category: 'console', message: 'sent to fay@q.com' }],
    } as never) as never as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const json = JSON.stringify(e);
    expect(json).not.toMatch(/doe@|bob@|carol@|dave@|erin@|fay@/);
    expect(e.message).toBe('failed for j***@example.com');
    expect(e.extra.nested[0]).toBe('d***@y.net');
  });
  it('options: no tracing, no PII collection', () => {
    const o = siteSentryOptions('https://k@o.ingest.sentry.io/1', 'production');
    expect(o.tracesSampleRate).toBe(0);
    expect(o.dataCollection.userInfo).toBe(false);
    expect(o.dataCollection.cookies).toBe(false);
  });
});
