// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PressureBadge } from './pressure-badge';

describe('PressureBadge', () => {
  it('names the level for screen readers', () => {
    render(<PressureBadge score={86} level="high" />);
    expect(screen.getByLabelText('Competitive pressure 86 of 100, high')).toBeTruthy();
  });
});
