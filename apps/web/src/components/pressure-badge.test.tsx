// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PressureBadge } from './pressure-badge';

describe('PressureBadge', () => {
  it('names the level for screen readers in the same words as the visible text', () => {
    const { unmount } = render(<PressureBadge score={86} level="high" />);
    expect(screen.getByLabelText('Competitive pressure 86 of 100, high pressure')).toBeTruthy();
    unmount();
    render(<PressureBadge score={55} level="elevated" />);
    expect(screen.getByLabelText('Competitive pressure 55 of 100, medium pressure')).toBeTruthy();
    render(<PressureBadge score={0} level="low" />);
    expect(screen.getByLabelText('Competitive pressure 0 of 100, quiet')).toBeTruthy();
  });

  it.each([
    [86, 'high', 'High pressure'],
    [70, 'high', 'High pressure'],
    [55, 'elevated', 'Medium pressure'],
    [40, 'elevated', 'Medium pressure'],
    [12, 'low', 'Low pressure'],
    [0, 'low', 'Quiet'],
  ] as const)('score %i (%s) shows visible text "%s" next to the number', (score, level, text) => {
    const { container } = render(<PressureBadge score={score} level={level} />);
    const label = screen.getByText(text);
    expect(label.className).not.toContain('sr-only');
    expect(container.textContent).toContain(String(score));
  });
});
