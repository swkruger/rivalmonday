import { redactForLog } from '@cs/core/server';
import { describe, expect, it } from 'vitest';
import { scrubBrowserEvent, scrubEvent, scrubEventUrls, scrubUrl } from './sentry-scrub';

const fixtures: unknown[] = [
  'contact jane.doe@example.com now',
  { message: 'mail bob@acme.io', authorization: 'Bearer abc', nested: { apiKey: 'k', cookie: 'c', ok: 'x@y.com' } },
  { prompt: 'secret prompt', output: 'secret out', reviewText: 'great', list: [{ token: 't', text: 'abc' }, 'z@q.org'] },
  Object.assign(new Error('failed for ann@corp.com', { cause: new Error('inner bo@x.io') }), { stack: 'Error: ann@corp.com at f' }),
  { a: 1, b: null, c: [1, 2], d: { password: 'p' } },
];

describe('browser scrubber', () => {
  it('masks like redactForLog', () => {
    for (const f of fixtures) expect(scrubEvent(f)).toEqual(redactForLog(f));
  });
  it('cuts cycles', () => {
    const a: Record<string, unknown> = { n: 1 };
    a.self = a;
    expect(scrubEvent(a)).toEqual(redactForLog(a));
  });
});

describe('URL scrubbing', () => {
  const event = () => ({
    request: { url: 'https://app.test/dashboard?token=SECRET&x=1#frag', query_string: 'token=SECRET', cookies: { a: 'b' }, headers: { host: 'app.test' } },
    transaction: 'GET /l/GUESTTOKEN?x=1',
    breadcrumbs: [{ category: 'navigation', data: { from: '/join/INVITETOKEN?a=1', to: '/c/123?magic=SECRET' } }, { category: 'fetch', data: { url: 'https://app.test/api?token=SECRET' } }],
  });
  it('drops query string, cookies and URL queries', () => {
    const out = JSON.stringify(scrubEventUrls(event()));
    expect(out).not.toContain('SECRET');
    expect(out).not.toContain('query_string');
    expect(out).not.toContain('cookies');
    expect(out).toContain('https://app.test/dashboard');
  });
  it('masks secret path segments', () => {
    const out = JSON.stringify(scrubEventUrls(event()));
    expect(out).not.toContain('GUESTTOKEN');
    expect(out).not.toContain('INVITETOKEN');
    expect(scrubUrl('https://app.test/start/verify/TOK?x=1')).toBe('https://app.test/start/verify/[redacted]');
    expect(scrubUrl('/start/v/LEAD')).toBe('/start/v/[redacted]');
    expect(scrubUrl('/c/abc/briefs/1')).toBe('/c/abc/briefs/1');
  });
  it('scrubs breadcrumb urls', () => {
    const e = scrubEventUrls(event());
    expect(e.breadcrumbs[0]!.data).toEqual({ from: '/join/[redacted]', to: '/c/123' });
    expect(e.breadcrumbs[1]!.data.url).toBe('https://app.test/api');
  });
  it('browser hook = key/email redaction plus URL scrub', () => {
    const out = JSON.stringify(scrubBrowserEvent({ ...event(), user: { email: 'jo@x.com' }, extra: { token: 't' } }));
    expect(out).not.toContain('SECRET');
    expect(out).not.toContain('jo@x.com');
    expect(out).toContain('[redacted]');
  });
});
