// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('shows the title, value, pill and hint', () => {
    render(<StatCard title="Changes this week" value="14" pill={{ text: '3 high', tone: 'warn' }} hint="Across websites" />);
    expect(screen.getByText('Changes this week')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText('3 high')).toBeTruthy();
    expect(screen.getByText('Across websites')).toBeTruthy();
  });
});
