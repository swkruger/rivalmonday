// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

import { RankTabs } from './tabs';

describe('RankTabs', () => {
  it('renders two tabs, the selected one carries aria-selected', () => {
    render(<RankTabs tab="trend" query={{}} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Trend' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Compare' }).getAttribute('aria-selected')).toBe('false');
  });

  beforeEach(() => { replace.mockReset(); });

  it('ArrowRight on Trend moves focus to Compare and activates it', () => {
    render(<RankTabs tab="trend" query={{ keyword: 'ac repair' }} />);
    const trend = screen.getByRole('tab', { name: 'Trend' });
    const compare = screen.getByRole('tab', { name: 'Compare' });
    expect(compare.tabIndex).toBe(-1);
    trend.focus();
    fireEvent.keyDown(trend, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(compare);
    expect(replace).toHaveBeenCalledWith('?keyword=ac+repair&tab=compare', { scroll: false });
  });

  it('ArrowLeft wraps and Home/End jump; Trend drops the tab param', () => {
    render(<RankTabs tab="compare" query={{ tab: 'compare', a: 'x' }} />);
    const compare = screen.getByRole('tab', { name: 'Compare' });
    compare.focus();
    fireEvent.keyDown(compare, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Trend' }));
    expect(replace).toHaveBeenLastCalledWith('?a=x', { scroll: false });
    replace.mockReset();
    fireEvent.keyDown(compare, { key: 'End' });
    expect(document.activeElement).toBe(compare);
    expect(replace).not.toHaveBeenCalled(); // already the active tab
    fireEvent.keyDown(compare, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Trend' }));
  });
});
