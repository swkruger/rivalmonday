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

  it('toolbarControlClass matches Button size="sm" height at 13 px text, with no competing size', () => {
    const tokens = toolbarControlClass.split(/\s+/);
    expect(tokens).toContain('h-7');
    expect(tokens).toContain('text-13');
    expect(tokens).not.toContain('h-9');
    expect(tokens).not.toContain('text-sm');
  });
});
