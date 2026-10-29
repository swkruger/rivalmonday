import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', () => ({ usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }) }));
vi.mock('../join/join-provider', () => ({ useJoin: () => ({ open: () => {} }) }));
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test' } }));

import { PARTNER_EXAMPLE, partnerExample } from '../../../content/partners';
import { MarginExample } from './margin-example';

beforeEach(() => {
  pilot.pilotMode = true;
});

describe('MarginExample', () => {
  it('caption labels the price as an example and names fees', () => {
    render(<MarginExample />);
    const cap = screen.getByText(/^Example: 10 clients at an example price of \$199\/mo\./);
    expect(cap.textContent).toMatch(/You set your own prices\. Before Stripe processing fees and taxes\./);
  });
  it('figures render from partnerExample', () => {
    const { container } = render(<MarginExample />);
    const e = partnerExample(PARTNER_EXAMPLE.clients, PARTNER_EXAMPLE.clientPriceUsd);
    const text = container.textContent ?? '';
    expect(text).toContain('$229 + 7 × $99');
    expect(text).toContain(`$${e.revenueUsd.toLocaleString('en-US')}`);
    expect(text).toContain(`$${e.marginUsd.toLocaleString('en-US')}`);
    expect(text).toContain(`$${e.costUsd}`);
  });
  it('shows the pilot note only in pilot mode', () => {
    const { container, rerender } = render(<MarginExample />);
    expect(container.textContent).toContain('Free during the pilot');
    pilot.pilotMode = false;
    rerender(<MarginExample />);
    expect(container.textContent).not.toContain('Free during the pilot');
  });
});
