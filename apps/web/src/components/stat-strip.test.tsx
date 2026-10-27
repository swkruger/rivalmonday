// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatBadge, type StatPill, StatStrip } from './stat-strip';

afterEach(cleanup);

describe('StatStrip', () => {
  it('renders one strip with an h2 per item', () => {
    const { container } = render(
      <StatStrip label="Overview" items={[
        { title: 'Changes this week', value: '14', pill: { text: '3 high', tone: 'warn' }, hint: 'Across websites' },
        { title: 'Alerts waiting', value: '1', href: '/agency/alerts' },
        { title: 'C', value: '2' },
        { title: 'D', value: '3' },
      ]} />,
    );
    expect(container.querySelectorAll('[data-slot=kpi-strip]')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(4);
    expect(screen.getByRole('heading', { level: 2, name: 'Changes this week' })).toBeTruthy();
    expect(screen.getByText('Across websites')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Alerts waiting/ }).getAttribute('href')).toBe('/agency/alerts');
    expect(container.querySelectorAll('[data-slot=kpi-strip] a')).toHaveLength(1);
  });
  it('keeps the help button name', () => {
    render(<StatStrip items={[{ title: 'Changes this week', value: '1', help: <button type="button" aria-label="About Changes this week">?</button> }]} />);
    expect(screen.getByRole('button', { name: 'About Changes this week' })).toBeTruthy();
  });
  it('omits the badge without a pill', () => {
    const { container } = render(<StatStrip items={[{ title: 'T', value: '1' }]} />);
    expect(container.querySelector('[data-tone]')).toBeNull();
  });
});

describe('StatBadge', () => {
  it.each(['up', 'down', 'warn', 'info'] as const)('sets data-tone %s', (tone) => {
    const { container } = render(<StatBadge pill={{ text: `p-${tone}`, tone }} />);
    expect(container.querySelector('[data-tone]')?.getAttribute('data-tone')).toBe(tone);
  });
  it('hides the glyph and speaks srLabel', () => {
    const { container } = render(<StatBadge pill={{ glyph: '▲', srLabel: 'Up', text: '4 since your starting point', tone: 'up' }} />);
    expect(container.querySelector('[aria-hidden=true]')?.textContent).toContain('▲');
    expect(container.querySelector('.sr-only')?.textContent).toContain('Up');
    expect(container.textContent).toContain('4 since your starting point');
  });
});

describe('StatPill (16c: lives in stat-strip)', () => {
  it('is exported from stat-strip and renders through StatStrip', () => {
    const pill: StatPill = { text: '+2', tone: 'up', glyph: '▲', srLabel: 'Up' };
    const { container } = render(<StatStrip items={[{ title: 'Seats', value: '5', pill, hint: 'Last 28 days' }]} />);
    expect(container.querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('up');
    expect(container.textContent).toContain('+2');
  });
});
