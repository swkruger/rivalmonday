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
    { serviceId: 'ac_tune_up', prices: [{ amount: 79, unit: 'USD', qualifier: 'exact' as const, promo: true, since: '2026-10-01T00:00:00.000Z' }], change: { before: 99, after: 79 } },
    { serviceId: 'furnace_repair', prices: [{ amount: 129, unit: 'USD', qualifier: 'from' as const, promo: false, since: '2026-10-01T00:00:00.000Z' }], change: null },
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
    expect(tune.textContent).toContain('PROMO');
    expect(tune.textContent).toContain('▼ $20');
    expect(screen.getByRole('link', { name: /Furnace repair/ }).textContent).toContain('from $129');
  });

  it('says so when the competitor shows no prices', () => {
    render(<PriceCard row={{ ...row, cells: [] }} services={services} selectedServiceId={null} hrefFor={() => '#'} />);
    expect(screen.getByText('No prices seen on its website yet.')).toBeTruthy();
  });
});
