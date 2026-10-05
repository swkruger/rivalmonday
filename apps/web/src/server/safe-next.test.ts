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
    // Review finding (Critical): new URL() collapses dot segments, so these must be re-checked on the
    // *normalised* output (otherwise each resolves to the protocol-relative `//evil.com`).
    ['/.//evil.com', '/'],
    ['/..//evil.com', '/'],
    ['/a/..//evil.com', '/'],
    ['/%2e//evil.com', '/'],
    ['/%2e%2e//evil.com', '/'],
  ])('%s → %s', (raw, want) => expect(safeNext(raw)).toBe(want));
});
