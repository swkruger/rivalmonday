import { describe, expect, it } from 'vitest';
import { nativeSelectClass, textareaClass } from './control-classes';

describe('native control classes', () => {
  it.each([
    ['nativeSelectClass', nativeSelectClass],
    ['textareaClass', textareaClass],
  ])('%s keeps the fixed focus and error look (guard)', (_n, cls) => {
    expect(cls).toContain('focus-visible:outline-ring');
    expect(cls).toContain('aria-invalid:border-danger');
  });
});
