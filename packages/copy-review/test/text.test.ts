import { describe, expect, it } from 'vitest';
import { hashText, normalise } from '../src/text.js';

describe('text', () => {
  it('normalise collapses whitespace and trims', () => {
    expect(normalise('  a \n\t b   c  ')).toBe('a b c');
  });
  it('hashText is 16 hex and ignores whitespace-only differences', () => {
    expect(hashText('Hello  world')).toMatch(/^[0-9a-f]{16}$/);
    expect(hashText(' Hello\nworld ')).toBe(hashText('Hello world'));
    expect(hashText('Hello world!')).not.toBe(hashText('Hello world'));
  });
});
