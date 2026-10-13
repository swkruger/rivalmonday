// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShellTheme } from './shell-theme';

describe('ShellTheme (8b M1)', () => {
  it("mirrors the shell's vars onto <html> while mounted and restores the previous values on unmount", () => {
    const html = document.documentElement.style;
    html.setProperty('--primary', '#47a8e7');
    const { unmount, rerender } = render(<ShellTheme vars={{ '--primary': '#aa0000', '--secondary': '#00aa00' }} />);
    expect(html.getPropertyValue('--primary')).toBe('#aa0000');
    expect(html.getPropertyValue('--secondary')).toBe('#00aa00');
    rerender(<ShellTheme vars={{ '--primary': '#0000aa', '--secondary': '#00aa00' }} />);
    expect(html.getPropertyValue('--primary')).toBe('#0000aa');
    unmount();
    expect(html.getPropertyValue('--primary')).toBe('#47a8e7');
    expect(html.getPropertyValue('--secondary')).toBe('');
  });
});
