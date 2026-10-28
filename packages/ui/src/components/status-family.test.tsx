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
  it('warning renders an aria-hidden svg; neutral none; non-neutral always keeps a glyph', () => {
    const { container, rerender } = render(<StatusChip tone="warning">Slow</StatusChip>);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    rerender(<StatusChip tone="neutral">Idle</StatusChip>);
    expect(container.querySelector('svg')).toBeNull();
    // @ts-expect-error non-neutral tones cannot suppress the glyph (P7)
    rerender(<StatusChip tone="danger" icon={null}>Bad</StatusChip>);
    expect(container.querySelector('svg[aria-hidden]')).not.toBeNull();
    rerender(<StatusChip tone="neutral" icon={null}>Idle</StatusChip>);
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
  it('applied branch forwards onClick', () => {
    const onClick = vi.fn();
    render(<FilterChip applied field="Rating" onRemove={() => {}} onClick={onClick} data-testid="chip">Rating 4+</FilterChip>);
    fireEvent.click(screen.getByTestId('chip'));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('applied branch: remove click does not fire the chip onClick', () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(<FilterChip applied field="Rating" onRemove={onRemove} onClick={onClick}>Rating 4+</FilterChip>);
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter Rating' }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });
  it('applied branch: disabled disables the remove button and is not spread onto the span', () => {
    render(<FilterChip applied field="Rating" onRemove={() => {}} disabled type="button" aria-pressed data-testid="chip">Rating 4+</FilterChip>);
    expect((screen.getByRole('button', { name: 'Remove filter Rating' }) as HTMLButtonElement).disabled).toBe(true);
    const chip = screen.getByTestId('chip');
    for (const a of ['disabled', 'type', 'aria-pressed']) expect(chip.hasAttribute(a)).toBe(false);
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
  it('fallback form shows and is named "Evidence n"', () => {
    render(<CitationPill href="/e/2" n={2} />);
    const a = screen.getByRole('link', { name: 'Evidence 2' });
    expect(a.textContent).toBe('Evidence 2');
    expect(a.querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
  });
  it('n + source + date is named with all three', () => {
    render(<CitationPill href="/e/1" n={1} source="Smith HVAC" date="Oct 20, 2026" />);
    expect(screen.getByRole('link', { name: 'Evidence 1: Smith HVAC, Oct 20, 2026' })).toBeTruthy();
  });
  it('asChild puts the pill on the single child anchor', () => {
    const { container } = render(
      <CitationPill asChild n={3} source="Smith HVAC" date="Oct 20">
        <a href="/e/3" />
      </CitationPill>,
    )
    expect(container.querySelectorAll('a')).toHaveLength(1)
    const a = screen.getByRole('link', { name: 'Evidence 3: Smith HVAC, Oct 20' })
    expect(a.getAttribute('data-slot')).toBe('citation-pill')
    expect(a.getAttribute('href')).toBe('/e/3')
  })
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
