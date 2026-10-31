import { describe, expect, it } from 'vitest';
import { nativeInputClass, nativeSelectClass, textareaClass, toolbarControlClass } from './control-classes';

describe('native control classes', () => {
  it.each([
    ['nativeSelectClass', nativeSelectClass],
    ['nativeInputClass', nativeInputClass],
    ['textareaClass', textareaClass],
    ['toolbarControlClass', toolbarControlClass],
  ])('%s keeps the fixed focus and error look (guard)', (_n, cls) => {
    expect(cls).toContain('focus-visible:outline-ring');
    expect(cls).toContain('aria-invalid:border-danger');
  });

  it('toolbarControlClass is the one 36 px control at form text size, with no competing size', () => {
    const tokens = toolbarControlClass.split(/\s+/);
    expect(tokens).toContain('h-9');
    expect(tokens).toContain('text-sm');
    expect(tokens).not.toContain('text-13');
  });
});
