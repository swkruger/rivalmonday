// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FridayAvatar } from './friday-avatar';

describe('FridayAvatar', () => {
  it('is decorative and small by default', () => {
    const { container } = render(<FridayAvatar />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toBe('/friday-mascot-96.webp');
    expect(img.className).toContain('size-6');
  });

  it('the large size uses the large file', () => {
    const { container } = render(<FridayAvatar size="lg" />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/friday-mascot.webp');
  });
});
