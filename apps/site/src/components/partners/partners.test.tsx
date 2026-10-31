import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', () => ({ usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }) }));
vi.mock('../join/join-provider', () => ({ useJoin: () => ({ open: () => {} }) }));
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test', comparePages: [] } }));
vi.mock('../home/cta-band', () => ({ CtaBand: () => null }));

import { PARTNER_COPY, PARTNER_EXAMPLE, partnerExample, partnerUpsell } from '../../../content/partners';
import PartnersPage from '../../app/partners/page';
import { MarginExample } from './margin-example';

beforeEach(() => {
  pilot.pilotMode = true;
});

describe('PartnersPage', () => {
  it('has one h1, the calculator, every value section and the upsell services', () => {
    const { container } = render(<PartnersPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelector('[data-slot="margin-example"]')).toBeTruthy();
    for (const s of PARTNER_COPY.sections) expect(screen.getByRole('heading', { level: 2, name: s.heading })).toBeTruthy();
    for (const service of PARTNER_COPY.upsellServices) expect(screen.getByText(service).tagName).toBe('LI');
  });
});

describe('MarginExample', () => {
  it('caption labels the price as an example and names fees', () => {
    render(<MarginExample />);
    const cap = screen.getByText(/^Example: 50 clients at an example price of \$199\/mo, with 10 also buying an upsell at an example \$999\/mo\./);
    expect(cap.textContent).toMatch(/You set your own prices\. Upsell revenue is before what the work costs you to deliver\. Before Stripe processing fees and taxes\./);
  });
  it('the sliders recalculate every figure', () => {
    const { container } = render(<MarginExample />);
    fireEvent.change(screen.getByRole('slider', { name: 'Clients' }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Clients who also buy an upsell' }), { target: { value: '50' } });
    const text = container.textContent ?? '';
    expect(text).toContain('$229 + 7 × $99 = $922');
    expect(text).toContain('5 × $999 = $4,995');
    expect(container.querySelector('output')!.textContent).toContain('$6,063');
    expect(container.querySelector('output')!.textContent).toContain('$72,756');
  });
  it('one client with no upsell shows the loss and has no extra-seat sum', () => {
    const { container } = render(<MarginExample />);
    fireEvent.change(screen.getByRole('slider', { name: 'Clients' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Clients who also buy an upsell' }), { target: { value: '0' } });
    expect(container.querySelector('output')!.textContent).toContain('−$30');
    expect(container.textContent).not.toContain(' + 0 × ');
    expect(screen.getByText(/^Example: 1 client at/)).toBeTruthy();
  });
  it('figures render from partnerExample', () => {
    const { container } = render(<MarginExample />);
    const e = partnerExample(PARTNER_EXAMPLE.clients, PARTNER_EXAMPLE.clientPriceUsd);
    const u = partnerUpsell(e, PARTNER_EXAMPLE.upsellSharePct, PARTNER_EXAMPLE.upsellPriceUsd);
    const text = container.textContent ?? '';
    expect(text).toContain('$229 + 47 × $99');
    for (const n of [e.costUsd, e.revenueUsd, e.marginUsd, u.upsellRevenueUsd, u.totalUsd]) expect(text).toContain(`$${n.toLocaleString('en-US')}`);
  });
  it('rendered copy has no affiliate or commission wording', () => {
    const { container } = render(<MarginExample />);
    expect(container.textContent).not.toMatch(/affiliate|commission|referral fee/i);
  });
  it('shows the pilot note only in pilot mode', () => {
    const { container, rerender } = render(<MarginExample />);
    expect(container.textContent).toContain('Free during the pilot');
    pilot.pilotMode = false;
    rerender(<MarginExample />);
    expect(container.textContent).not.toContain('Free during the pilot');
  });
});
