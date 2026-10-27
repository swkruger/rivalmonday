// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Segmented, segmentedItemClass, segmentedTrackClass } from './segmented';

afterEach(cleanup);

const items = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

describe('Segmented', () => {
  it('renders a named radiogroup with radio items', () => {
    render(<Segmented value="7d" onValueChange={() => {}} items={items} aria-label="Range" />);
    expect(screen.getByRole('radiogroup', { name: 'Range' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: '7 days' }).getAttribute('aria-checked')).toBe('true');
  });

  it('clicking an item calls onValueChange', () => {
    const fn = vi.fn();
    render(<Segmented value="7d" onValueChange={fn} items={items} aria-label="Range" />);
    fireEvent.click(screen.getByRole('radio', { name: '30 days' }));
    expect(fn).toHaveBeenCalledWith('30d');
  });

  it('clicking the active item never reports an empty value', () => {
    const fn = vi.fn();
    render(<Segmented value="7d" onValueChange={fn} items={items} aria-label="Range" />);
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }));
    expect(fn).not.toHaveBeenCalledWith('');
  });
});

describe('segmented classes for links and tabs', () => {
  it('the item class carries the active look for aria-current and aria-selected items (guard)', () => {
    expect(segmentedItemClass).toContain('aria-[current=page]:');
    expect(segmentedItemClass).toContain('aria-[current=true]:');
    expect(segmentedItemClass).toContain('aria-selected:');
    expect(segmentedItemClass).toContain('data-[state=on]:');
  });

  it('applies to a link and a tab', () => {
    render(
      <div className={segmentedTrackClass}>
        <a href="/x" aria-current="page" className={segmentedItemClass}>All</a>
        <button role="tab" aria-selected="true" className={segmentedItemClass}>Trend</button>
      </div>,
    );
    expect(screen.getByRole('link', { name: 'All' }).className).toContain('aria-[current=page]:bg-surface');
    expect(screen.getByRole('tab', { name: 'Trend' }).className).toContain('aria-selected:bg-surface');
    expect(segmentedTrackClass).toContain('bg-muted-surface');
  });
});
