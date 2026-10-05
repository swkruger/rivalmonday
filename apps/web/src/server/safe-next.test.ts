import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext (Review Focus 2)', () => {
  it.each([
    ['/c/123/briefs/9', '/c/123/briefs/9'],
    ['/inbox?x=1#y', '/inbox?x=1#y'],
    [null, '/'],
    ['', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['/%2F%2Fevil.com', '/%2F%2Fevil.com'],
    [' /inbox', '/'],
    ['/a\nb', '/'],
    ['/%5Cevil.com', '/%5Cevil.com'],
    ['/a\u0000b', '/'],
  ])('%s → %s', (raw, want) => expect(safeNext(raw)).toBe(want));
});
