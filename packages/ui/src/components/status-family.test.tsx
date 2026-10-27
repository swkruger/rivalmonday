// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Star } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CitationPill } from './citation-pill';
import { DotStatus } from './dot-status';
import { FilterChip } from './filter-chip';
import { FridayBadge } from './friday-badge';
import { SourcesList } from './sources-list';
import { StatusChip } from './status-chip';
import { Tag } from './tag';
import { TierMark } from './tier-mark';

afterEach(cleanup);

describe('StatusChip glyphs', () => {
  it('warning renders an aria-hidden svg; neutral none; icon={null} suppresses', () => {
    const { container, rerender } = render(<StatusChip tone="warning">Slow</StatusChip>);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    rerender(<StatusChip tone="neutral">Idle</StatusChip>);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<StatusChip tone="danger" icon={null}>Bad</StatusChip>);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<StatusChip tone="neutral" icon={Star}>Fav</StatusChip>);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.firstElementChild?.getAttribute('data-tone')).toBe('neutral');
  });
});

describe('DotStatus', () => {
  it.each(['success', 'warning', 'danger', 'info', 'neutral', 'off'] as const)('maps tone %s', (tone) => {
    render(<DotStatus tone={tone}>Label</DotStatus>);
    expect(screen.getByText('Label').getAttribute('data-tone')).toBe(tone);
    expect(screen.getByText('Label').querySelector('[aria-hidden="true"]')).not.toBeNull();
    cleanup();
  });
});

describe('FilterChip', () => {
  it('applied + onRemove renders a named remove button', () => {
    const onRemove = vi.fn();
    render(<FilterChip applied field="Rating" onRemove={onRemove}>Rating 4+</FilterChip>);
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter Rating' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
  it('pressed sets aria-pressed', () => {
    render(<FilterChip pressed>Open</FilterChip>);
    expect(screen.getByRole('button', { name: 'Open' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('not pressed has no aria-pressed', () => {
    render(<FilterChip>Open</FilterChip>);
    expect(screen.getByRole('button', { name: 'Open' }).hasAttribute('aria-pressed')).toBe(false);
  });
});

describe('Tag / TierMark', () => {
  it('Tag renders children', () => {
    render(<Tag>HVAC</Tag>);
    expect(screen.getByText('HVAC').getAttribute('data-slot')).toBe('tag');
  });
  it.each([['top', 'Top rival'], ['watch', 'Worth watching'], ['minor', 'Minor']] as const)('TierMark %s', (tier, label) => {
    render(<TierMark tier={tier} />);
    const el = screen.getByText(label).closest('[data-slot="tier-mark"]');
    expect(el?.getAttribute('data-tier')).toBe(tier);
    cleanup();
  });
});

describe('CitationPill / SourcesList', () => {
  it('has the evidence accessible name', () => {
    render(<CitationPill href="/e/1" source="Google" date="3 Oct" />);
    const a = screen.getByRole('link', { name: 'Evidence: Google, 3 Oct' });
    expect(a.getAttribute('href')).toBe('/e/1');
  });
  it('lists sources as links', () => {
    render(<SourcesList items={[{ href: '/e/1', title: 'Pricing page', date: '3 Oct' }]} />);
    expect(screen.getByRole('link', { name: /Pricing page/ })).toBeTruthy();
    expect(screen.getByText('3 Oct')).toBeTruthy();
  });
});

describe('FridayBadge', () => {
  it('size label is shorter', () => {
    render(<FridayBadge size="label" />);
    expect(screen.getByText('Friday').getAttribute('data-size')).toBe('label');
  });
  it('default size', () => {
    render(<FridayBadge />);
    expect(screen.getByText('Friday').getAttribute('data-size')).toBe('default');
  });
});
