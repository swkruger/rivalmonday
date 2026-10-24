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

  it('stat card pills use chip tokens (no bg-[#)', () => {
    for (const tone of ['up', 'down', 'warn', 'info'] as const) {
      const { unmount } = render(<StatCard title="T" value="1" pill={{ text: `pill-${tone}`, tone }} />);
      const cls = screen.getByText(`pill-${tone}`).className;
      expect(cls).not.toContain('bg-[#');
      expect(cls).not.toContain('text-[#');
      unmount();
    }
  });

  it('the linked card follows design system v1 (border, rounded-md, no shadow) and pads p-4 on phones', () => {
    render(<StatCard title="Alerts waiting" value="1" href="/agency/alerts" />);
    const link = screen.getByRole('link', { name: /Alerts waiting/ });
    expect(link.getAttribute('href')).toBe('/agency/alerts');
    const cls = link.className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['rounded-md', 'border', 'border-line', 'p-4', 'sm:p-6']));
    expect(link.className).not.toMatch(/shadow-card|rounded-\[14px\]/);
  });
});
