// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceCard } from './price-card';

const services = [
  { id: 'ac_tune_up', name: 'AC tune-up', offered: true },
  { id: 'furnace_repair', name: 'Furnace repair', offered: false },
];
const row = {
  competitorId: 'x', name: 'Smith HVAC',
  cells: [
    { serviceId: 'ac_tune_up', prices: [{ amount: 79, unit: 'USD', qualifier: 'exact' as const, promo: true, since: '2026-10-01T00:00:00.000Z', source: 'web' as const, evidenceIds: [] as string[] }], change: { before: 99, after: 79 } },
    { serviceId: 'furnace_repair', prices: [{ amount: 129, unit: 'USD', qualifier: 'from' as const, promo: false, since: '2026-10-01T00:00:00.000Z', source: 'web' as const, evidenceIds: [] as string[] }], change: null },
  ],
};

describe('PriceCard', () => {
  it('lists each service as a link with its price, promo, change and "your service" tag', () => {
    render(<PriceCard row={row} services={services} selectedServiceId="ac_tune_up" hrefFor={(s) => `/p?service=${s}`} />);
    expect(screen.getByRole('heading', { name: 'Smith HVAC' })).toBeTruthy();
    const tune = screen.getByRole('link', { name: /AC tune-up/ });
    expect(tune.getAttribute('href')).toBe('/p?service=ac_tune_up');
    expect(tune.getAttribute('aria-current')).toBe('true');
    expect(tune.textContent).toContain('Your service');
    expect(tune.textContent).toContain('$79');
    expect(tune.textContent).toContain('Promo');
    expect(tune.textContent).toContain('▼ $20');
    expect(screen.getByRole('link', { name: /Furnace repair/ }).textContent).toContain('from $129');
  });

  it('price change chip uses chip tokens', () => {
    render(<PriceCard row={row} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    const chip = screen.getByText('▼ $20').parentElement!;
    expect(chip.className).toContain('bg-chip-danger-bg');
    expect(chip.className).not.toContain('[#');
    expect(screen.getByText('Promo').closest('[data-slot=status-chip]')?.getAttribute('data-tone')).toBe('warning');
  });

  it('keeps pill grammar: no rounded-full anywhere in the card', () => {
    const { container } = render(<PriceCard row={row} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    expect(container.innerHTML).not.toContain('rounded-full');
    expect(screen.getByText('Your service').getAttribute('data-slot')).toBe('tag');
  });

  it('gives the change pill screen-reader wording', () => {
    const up = { ...row, cells: [{ ...row.cells[0]!, change: { before: 79, after: 99 } }] };
    const { rerender } = render(<PriceCard row={row} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    expect(screen.getByText('down $20 since 90 days ago').className).toContain('sr-only');
    rerender(<PriceCard row={up} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    expect(screen.getByText('up $20 since 90 days ago')).toBeTruthy();
  });

  it('"From an ad" tag on ad rows only', () => {
    const mixed = { ...row, cells: [{ ...row.cells[0]!, prices: [row.cells[0]!.prices[0]!, { amount: 59, unit: 'USD', qualifier: 'exact' as const, promo: false, since: '2026-10-02T00:00:00.000Z', source: 'meta_ad' as const, evidenceIds: [] as string[] }] }, row.cells[1]!] };
    render(<PriceCard row={mixed} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    const tags = screen.getAllByText('From an ad');
    expect(tags).toHaveLength(1);
    expect(tags[0]!.getAttribute('data-slot')).toBe('tag');
    expect(screen.getByRole('link', { name: /Furnace repair/ }).textContent).not.toContain('From an ad');
  });

  it('says so when the competitor shows no prices', () => {
    render(<PriceCard row={{ ...row, cells: [] }} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    expect(screen.getByText('No prices seen on its website yet.')).toBeTruthy();
  });
});

describe('PriceCard ad image tag', () => {
  it('price-card renders the image tag without a nested link', () => {
    const img = { ...row, cells: [{ ...row.cells[0]!, prices: [{ amount: 89, unit: 'USD', qualifier: 'exact' as const, promo: false, since: '2026-10-02T00:00:00.000Z', source: 'ad_image' as const, evidenceIds: ['e1'] }] }] };
    const { container } = render(<PriceCard row={img} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    const tag = screen.getByText('From an ad image');
    expect(tag.getAttribute('data-slot')).toBe('tag');
    expect(tag.closest('a')?.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelectorAll('a a')).toHaveLength(0);
  });

  it('links the ad image evidence beside the row (not nested) when there is one', () => {
    const img = { ...row, cells: [{ ...row.cells[0]!, prices: [{ amount: 89, unit: 'USD', qualifier: 'exact' as const, promo: false, since: '2026-10-02T00:00:00.000Z', source: 'ad_image' as const, evidenceIds: ['e1'] }] }, row.cells[1]!] };
    const { container } = render(<PriceCard row={img} services={services} selectedServiceId={null} hrefFor={() => '#'} evidenceHref={(id) => `/c/c1/evidence/${id}`} />);
    const links = screen.getAllByRole('link', { name: 'Open the ad image for AC tune-up' });
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('/c/c1/evidence/e1');
    expect(container.querySelectorAll('a a')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: /Open the ad image for Furnace repair/ })).toBeNull();
  });

  it('shows no image link when the ad image price has no evidence id', () => {
    const img = { ...row, cells: [{ ...row.cells[0]!, prices: [{ amount: 89, unit: 'USD', qualifier: 'exact' as const, promo: false, since: '2026-10-02T00:00:00.000Z', source: 'ad_image' as const, evidenceIds: [] as string[] }] }] };
    render(<PriceCard row={img} services={services} selectedServiceId={null} hrefFor={() => '#'} evidenceHref={(id) => `/e/${id}`} />);
    expect(screen.queryByRole('link', { name: /Open the ad image/ })).toBeNull();
  });
});

describe('PriceCard Google post tag', () => {
  it('tags a post price and links the post beside the row (not nested)', () => {
    const post = { ...row, cells: [{ ...row.cells[0]!, prices: [{ amount: 79, unit: 'USD', qualifier: 'exact' as const, promo: true, since: '2026-10-02T00:00:00.000Z', source: 'gbp_post' as const, evidenceIds: [] as string[], postUrl: 'https://posts.example/p1' }] }] };
    const { container } = render(<PriceCard row={post} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    expect(screen.getByText('From a Google post')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Open the Google post for AC tune-up' });
    expect(link.getAttribute('href')).toBe('https://posts.example/p1');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.querySelectorAll('a a')).toHaveLength(0);
  });
});
