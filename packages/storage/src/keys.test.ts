import { describe, expect, it } from 'vitest';
import { assertValidKey } from './keys';

describe('assertValidKey', () => {
  it('accepts normal evidence keys', () => {
    expect(() => assertValidKey('evidence/0000-aa/1111-bb/page.html.gz')).not.toThrow();
  });
  it.each(['', '/abs', '../up', 'a/../b', 'a//b', 'a\\b', 'with space', `x${'a'.repeat(600)}`])('rejects %j', (k) => {
    expect(() => assertValidKey(k)).toThrow(/invalid object key/i);
  });
});
