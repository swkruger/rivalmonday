// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SpendBanner } from './spend-banner';

// formatDate omits the current year, so pin "now" (Date only).
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-23T12:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

const item = (n: number) => ({ clientId: `c${n}`, name: `Client ${n}`, until: '2026-11-01' });

describe('SpendBanner', () => {
  it('admin banner lists paused clients (C2) with a link to usage', () => {
    render(<SpendBanner audience="agency" agencyName="Acme" items={[item(1)]} />);
    const region = screen.getByRole('region', { name: 'Usage' });
    expect(region.textContent).toContain("AI work for Client 1 is paused until Nov 1 — it went well past this month's credits. Past briefs and evidence stay available. Contact support to raise the limit.");
    expect(screen.getByRole('link', { name: 'View usage' }).getAttribute('href')).toBe('/agency/settings/usage');
    expect(region.className).toContain('bg-muted-surface');
    expect(region.className).not.toMatch(/destructive|amber|red|orange/);
  });

  it('shows at most three clients, then "and {n} more"', () => {
    render(<SpendBanner audience="agency" agencyName="Acme" items={[1, 2, 3, 4, 5].map(item)} />);
    const region = screen.getByRole('region', { name: 'Usage' });
    expect(region.textContent).toContain('Client 3');
    expect(region.textContent).not.toContain('Client 4');
    expect(region.textContent).toContain('and 2 more');
  });

  it('client banner shows C3 with the agency name and no usage link', () => {
    render(<SpendBanner audience="client" agencyName="Acme" items={[item(1)]} />);
    expect(screen.getByRole('region', { name: 'Usage' }).textContent).toBe('Monitoring and new briefs are paused for the rest of this month. Your past briefs and evidence are still here, and your Acme team has been told.');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('an unbranded agency never reads as the product name', () => {
    render(<SpendBanner audience="client" agencyName="Rival Monday" items={[item(1)]} />);
    expect(screen.getByRole('region', { name: 'Usage' }).textContent).toMatch(/and your team has been told.$/);
  });

  it('renders nothing when no client is paused', () => {
    const { container } = render(<SpendBanner audience="agency" agencyName="Acme" items={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('names no dollars, cost or product', () => {
    const { container } = render(<SpendBanner audience="agency" agencyName="Acme" items={[item(1)]} />);
    expect(container.textContent).not.toMatch(/\$|cost|rival\s*monday/i);
  });
});
