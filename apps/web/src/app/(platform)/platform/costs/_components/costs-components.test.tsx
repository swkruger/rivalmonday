// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../actions', () => ({
  refreshCostsAction: vi.fn(),
  updateCostServiceAction: vi.fn(),
  saveCostItemAction: vi.fn(),
  archiveCostItemAction: vi.fn(),
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
import { ReadOnlyProvider } from '@/components/read-only';
import { saveCostItemAction, updateCostServiceAction } from '../actions';
import { CostItemDialog } from './cost-item-dialog';
import { CostItemsTable } from './cost-items-table';
import { CostWarningStrip } from './cost-warning-strip';
import { MonthlyChart } from './monthly-chart';
import { ServiceSettingsDialog } from './service-settings-dialog';
import { ServicesTable } from './services-table';
import type { CostService } from './types';

afterEach(cleanup);

const svc = (o: Partial<CostService>): CostService => ({
  service: 'openrouter', label: 'OpenRouter', kind: 'balance', unit: null, status: 'ok', amountUsd: null, units: null, capUsd: null, daysLeft: null,
  takenAt: '2026-10-14T06:00:00.000Z', error: null, billingUrl: null, lowThresholdUsd: null, warnDays: 7, unitRateUsd: null, enabled: true, ...o,
});

describe('CostWarningStrip', () => {
  it('strip copy: single and multiple', () => {
    const one = svc({ status: 'low', amountUsd: 12.34, daysLeft: 5.4 });
    const { rerender } = render(<CostWarningStrip low={[one]} />);
    const text = () => screen.getByRole('region', { name: 'Low balance warning' }).textContent;
    expect(text()).toBe('OpenRouter balance low: $12.34 · about 5 days left. View costs →');
    expect(screen.getByRole('link', { name: 'View costs →' }).getAttribute('href')).toBe('/platform/costs');
    rerender(<CostWarningStrip low={[{ ...one, daysLeft: null }]} />);
    expect(text()).toBe('OpenRouter balance low: $12.34. View costs →');
    rerender(<CostWarningStrip low={[{ ...one, daysLeft: 0.2 }]} />);
    expect(text()).toBe('OpenRouter balance low: $12.34 · less than a day left. View costs →');
    rerender(<CostWarningStrip low={[{ ...one, daysLeft: 1 }]} />);
    expect(text()).toBe('OpenRouter balance low: $12.34 · about 1 day left. View costs →');
    rerender(<CostWarningStrip low={[svc({ service: 'apify', label: 'Apify', kind: 'usage', status: 'low', amountUsd: 4.9, capUsd: 5 })]} />);
    expect(text()).toBe('Apify balance low: $0.10 left of $5.00 cap. View costs →');
    rerender(<CostWarningStrip low={[one, svc({ service: 'apify', label: 'Apify', status: 'low' })]} />);
    expect(text()).toBe('2 services are low on balance. View costs →');
    rerender(<CostWarningStrip low={[]} />);
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('ServicesTable', () => {
  it('services table renders each unit format and badge', () => {
    const rows = [
      svc({ service: 'openrouter', label: 'OpenRouter', status: 'ok', amountUsd: 12.34, daysLeft: 20.2, billingUrl: 'https://openrouter.ai/credits' }),
      svc({ service: 'scrapecreators', label: 'ScrapeCreators', unit: 'credits', status: 'low', amountUsd: 3.55, units: 7099, unitRateUsd: 0.0005 }),
      svc({ service: 'apify', label: 'Apify', kind: 'usage', status: 'unavailable', amountUsd: 0.95, capUsd: 5 }),
      svc({ service: 'neon', label: 'Neon', kind: 'usage', unit: 'CU-hours', status: 'ok', amountUsd: 1.23, units: 12.3, unitRateUsd: 0.1 }),
      svc({ service: 'anthropic', label: 'Anthropic', status: 'error', error: 'HTTP 401', takenAt: '2026-10-13T06:00:00.000Z' }),
      svc({ service: 'dataforseo', label: 'DataForSEO', status: 'not_configured', takenAt: null }),
      svc({ service: 'x', label: 'Off one', status: 'disabled' }),
    ];
    render(<ServicesTable services={rows} now={new Date('2026-10-14T08:00:00Z')} />);
    const row = (name: string) => within(screen.getByText(name).closest('tr') as HTMLElement);
    expect(row('OpenRouter').getByText('$12.34')).toBeTruthy();
    expect(row('OpenRouter').getByText('OK')).toBeTruthy();
    expect(row('OpenRouter').getByText('20')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'OpenRouter' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(row('ScrapeCreators').getByText('7,099 credits ≈ $3.55')).toBeTruthy();
    expect(row('ScrapeCreators').getByText('Low')).toBeTruthy();
    expect(row('Apify').getByText('$0.95 used of $5.00')).toBeTruthy();
    expect(row('Apify').getByText('Unavailable on this plan')).toBeTruthy();
    expect(row('Neon').getByText('12.3 CU-hours ≈ $1.23')).toBeTruthy();
    expect(row('Anthropic').getByText('Error')).toBeTruthy();
    expect(row('Anthropic').getByText('HTTP 401')).toBeTruthy();
    expect(row('Anthropic').getByText('yesterday')).toBeTruthy();
    expect(row('DataForSEO').getByText('Not configured')).toBeTruthy();
    expect(row('Off one').getByText('Off')).toBeTruthy();
    expect(row('Off one').getAllByText('—').length).toBeGreaterThanOrEqual(2);
    // the unit-rate field exists only for scrapecreators and neon
    fireEvent.click(screen.getByRole('button', { name: 'Edit ScrapeCreators' }));
    expect(screen.getByLabelText('Dollars per credit')).toBeTruthy();
    cleanup();
    render(<ServicesTable services={[rows[0]!]} now={new Date('2026-10-14T08:00:00Z')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit OpenRouter' }));
    expect(screen.queryByLabelText(/Dollars per/)).toBeNull();
  });

  it('hides Edit in a read-only session', () => {
    render(<ReadOnlyProvider readOnly><ServicesTable services={[svc({})]} now={new Date()} /></ReadOnlyProvider>);
    expect(screen.queryByRole('button', { name: 'Edit OpenRouter' })).toBeNull();
  });
});

describe('MonthlyChart', () => {
  it('chart renders 6 bars with titles', () => {
    const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month, i) => ({ month, apiUsd: i * 10, manualUsd: 25 }));
    const { container } = render(<MonthlyChart months={months} />);
    const bars = container.querySelectorAll('g[data-bar]');
    expect(bars).toHaveLength(6);
    expect(bars[5]!.querySelector('title')!.textContent).toBe('Oct 2026: $75.00 (API $50.00, manual $25.00)');
    expect(bars[0]!.querySelectorAll('rect')).toHaveLength(1); // zero API spend draws no API segment
    expect(container.querySelectorAll('rect[fill="var(--secondary)"]')).toHaveLength(5);
    expect(container.querySelectorAll('rect[fill="var(--amber)"]')).toHaveLength(6);
    expect(screen.getByText('API usage')).toBeTruthy();
    expect(screen.getByText('Manual costs')).toBeTruthy();
  });
});

describe('CostItemDialog', () => {
  it('item dialog hides period/end date for one-off', () => {
    render(<CostItemDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));
    expect(screen.getByLabelText('Period')).toBeTruthy();
    expect(screen.getByLabelText('Ends on (optional)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'one_off' } });
    expect(screen.queryByLabelText('Period')).toBeNull();
    expect(screen.queryByLabelText('Ends on (optional)')).toBeNull();
    expect(screen.getByLabelText('Date')).toBeTruthy();
  });
});

describe('CostItemsTable', () => {
  const items = [
    { id: 'i1', name: 'Vercel', kind: 'recurring' as const, amountUsd: 240, period: 'yearly' as const, monthlyUsd: 20, startsOn: '2026-01-01', endsOn: null, billingUrl: 'https://vercel.com/billing', notes: null },
    { id: 'i2', name: 'Domain', kind: 'one_off' as const, amountUsd: 15, period: null, monthlyUsd: null, startsOn: '2026-03-02', endsOn: null, billingUrl: null, notes: null },
  ];
  it('shows types, per-month and the archive confirmation', () => {
    render(<CostItemsTable items={items} />);
    expect(within(screen.getByText('Vercel').closest('tr') as HTMLElement).getByText('Yearly')).toBeTruthy();
    expect(within(screen.getByText('Vercel').closest('tr') as HTMLElement).getByText('$20.00')).toBeTruthy();
    expect(within(screen.getByText('Domain').closest('tr') as HTMLElement).getByText('One-off')).toBeTruthy();
    expect(within(screen.getByText('Domain').closest('tr') as HTMLElement).getByText('—')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Archive Domain' }));
    expect(screen.getByText('Archive Domain?')).toBeTruthy();
    expect(screen.getByText('It stays in past months’ totals.')).toBeTruthy();
  });
  it('cost item dates render "Oct 1 → ongoing" (no ISO)', () => {
    const y = new Date().getUTCFullYear();
    render(<CostItemsTable items={[
      { ...items[0]!, id: 'd1', name: 'Hosting', startsOn: `${y}-10-01`, endsOn: null },
      { ...items[0]!, id: 'd2', name: 'Trial tool', startsOn: `${y}-10-01`, endsOn: `${y}-12-31` },
      { ...items[1]!, id: 'd3', name: 'Old domain', startsOn: '2024-03-02' },
    ]} />);
    const row = (n: string) => screen.getByText(n).closest('tr') as HTMLElement;
    expect(within(row('Hosting')).getByText('Oct 1 → ongoing')).toBeTruthy();
    expect(within(row('Trial tool')).getByText('Oct 1 → Dec 31')).toBeTruthy();
    expect(within(row('Old domain')).getByText('Mar 2, 2024')).toBeTruthy();
  });
  it('has no controls in a read-only session', () => {
    render(<ReadOnlyProvider readOnly><CostItemsTable items={items} /></ReadOnlyProvider>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('dialogs close and reset after a save', () => {
  it('CostItemDialog closes on "Saved." and the next open has an empty form', async () => {
    vi.mocked(saveCostItemAction).mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<CostItemDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Hosting' } });
    fireEvent.change(screen.getByLabelText('Amount (USD)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('ServiceSettingsDialog closes on a successful save', async () => {
    vi.mocked(updateCostServiceAction).mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<ServiceSettingsDialog service={svc({})} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit OpenRouter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('ServiceSettingsDialog hints', () => {
  const open = (o: Partial<CostService>) => {
    const s = svc(o);
    render(<ServiceSettingsDialog service={s} />);
    fireEvent.click(screen.getByRole('button', { name: `Edit ${s.label}` }));
  };
  it('ScrapeCreators without a rate: dollars-per-credit hint', () => {
    open({ service: 'scrapecreators', label: 'ScrapeCreators', unit: 'credits' });
    expect(screen.getByText('Warnings need a dollars-per-credit rate.')).toBeTruthy();
    expect(screen.queryByText('Usage services without a plan cap never warn.')).toBeNull();
  });
  it('Neon: CU-hour rate hint and the no-cap hint', () => {
    open({ service: 'neon', label: 'Neon', kind: 'usage', unit: 'CU-hours' });
    expect(screen.getByText('Warnings need a dollars-per-CU-hour rate.')).toBeTruthy();
    expect(screen.getByText('Usage services without a plan cap never warn.')).toBeTruthy();
  });
  it('Anthropic: no-cap hint only; OpenRouter: no hint', () => {
    open({ service: 'anthropic', label: 'Anthropic', kind: 'usage' });
    expect(screen.getByText('Usage services without a plan cap never warn.')).toBeTruthy();
    expect(screen.queryByText(/Warnings need/)).toBeNull();
    cleanup();
    open({});
    expect(screen.queryByText(/never warn|Warnings need/)).toBeNull();
  });
});
