import { redactForLog } from '@cs/core/server';
import { describe, expect, it } from 'vitest';
import { scrubEvent } from './sentry-scrub';

const fixtures: unknown[] = [
  'contact jane.doe@example.com now',
  { message: 'mail bob@acme.io', authorization: 'Bearer abc', nested: { apiKey: 'k', cookie: 'c', ok: 'x@y.com' } },
  { prompt: 'secret prompt', output: 'secret out', reviewText: 'great', list: [{ token: 't', text: 'abc' }, 'z@q.org'] },
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
