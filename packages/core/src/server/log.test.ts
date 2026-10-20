import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, redactForLog } from './log';

describe('redactForLog', () => {
  it('redacts secret-like keys at any depth', () => {
    const out = redactForLog({ apiKey: 'a', nested: { Authorization: 'Bearer x', deep: [{ password: 'p', cookie: 'c', sessionToken: 't', sig: 1, signature: 's' }] }, ok: 1 }) as any;
    expect(out.apiKey).toBe('[redacted]');
    expect(out.nested.Authorization).toBe('[redacted]');
    expect(out.nested.deep[0]).toMatchObject({ password: '[redacted]', cookie: '[redacted]', sessionToken: '[redacted]', signature: '[redacted]', sig: 1 });
    expect(out.ok).toBe(1);
  });

  it('masks emails in strings, Error message/stack and cause', () => {
    expect(redactForLog('mail jane.doe@example.com now')).toBe('mail j***@example.com now');
    const err = new Error('bad jane@example.com', { cause: new Error('inner bob@corp.io') });
    const out = redactForLog(err) as any;
    expect(out.message).toBe('bad j***@example.com');
    expect(out.stack).not.toContain('jane@example.com');
    expect(out.cause.message).toBe('inner b***@corp.io');
  });

  it('drops prompt/body/text with length only', () => {
    const out = redactForLog({ prompt: 'hello', body: { a: 1 }, text: 'abc', content: 'x', other: 'keep' }) as any;
    expect(out.prompt).toBe('[dropped 5 chars]');
    expect(out.body).toBe('[dropped]');
    expect(out.text).toBe('[dropped 3 chars]');
    expect(out.other).toBe('keep');
  });

  it('arrays and circular refs never throw', () => {
    const a: any = { list: [1, 'x@y.com', { token: 't' }] };
    a.self = a;
    const out = redactForLog(a) as any;
    expect(out.self).toBe('[circular]');
    expect(out.list[1]).toBe('x***@y.com');
    expect(out.list[2].token).toBe('[redacted]');
  });

  it('keeps ids and uuids intact', () => {
    const id = '3f2b8c1e-5a4d-4e2f-9b1a-0c7d6e5f4a3b';
    expect(redactForLog({ clientId: id, agencyId: id, n: 3, b: true, z: null })).toEqual({ clientId: id, agencyId: id, n: 3, b: true, z: null });
  });
});

describe('createLogger', () => {
  it('writes one JSON line with child context', () => {
    const lines: string[] = [];
    const destination = new Writable({ write(chunk, _e, cb) { lines.push(String(chunk)); cb(); } });
    const log = createLogger({ level: 'info', pretty: false, destination }).child({ clientId: 'c1', job: 'j' });
    log.info({ apiKey: 'sekret', who: 'a@b.com' }, 'hello');
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]!);
    expect(row).toMatchObject({ msg: 'hello', clientId: 'c1', job: 'j', apiKey: '[redacted]', who: 'a***@b.com' });
    expect(JSON.stringify(row)).not.toContain('sekret');
  });
});

describe('Logger types', () => {
  it('rejects a second argument after a bare message (pino would drop it)', () => {
    const log = createLogger({ level: 'silent' });
    // @ts-expect-error a string first argument takes no msg
    log.error('failed', 'extra');
    log.error({ a: 1 }, 'ok');
  });
});
