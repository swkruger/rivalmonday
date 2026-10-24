// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('./actions', () => ({ setClientLimitsAction: (...a: unknown[]) => m.save(...a) }));
import { ReadOnlyProvider } from '@/components/read-only';
import { type ClientLimits, ClientLimitsTable } from './client-limits';

afterEach(cleanup);

const DATA: ClientLimits = {
  defaultLimitUsd: 15,
  pausePercent: 130,
  items: [
    { clientId: 'c1', name: 'Acme HVAC', status: 'active', spendUsd: 21.5, effectiveLimitUsd: 25, spendLimitUsd: 25, competitorLimit: 10, askMonthlyQuota: 100, level: 'paused', spendPausedAt: '2026-10-20T00:00:00.000Z' },
    { clientId: 'c2', name: 'Bright Dental', status: 'active', spendUsd: 1, effectiveLimitUsd: 15, spendLimitUsd: null, competitorLimit: 8, askMonthlyQuota: 50, level: 'ok', spendPausedAt: null },
  ],
};

describe('ClientLimitsTable', () => {
  it('shows spend, effective limit and level, and the default as the blank placeholder', () => {
    render(<ClientLimitsTable data={DATA} canEdit />);
    const row = screen.getByRole('row', { name: /Bright Dental/ });
    expect(within(row).getByText('$1.00')).toBeTruthy();
    expect(within(row).getByText('$15.00')).toBeTruthy();
    expect(within(row).getByText('OK')).toBeTruthy();
    expect((within(row).getByLabelText('Limit override for Bright Dental') as HTMLInputElement).placeholder).toBe('Default ($15)');
    expect(within(screen.getByRole('row', { name: /Acme HVAC/ })).getByText('Paused')).toBeTruthy();
  });

  it('limits editor clears an override with blank', async () => {
    m.save.mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<ClientLimitsTable data={DATA} canEdit />);
    const row = screen.getByRole('row', { name: /Acme HVAC/ });
    fireEvent.change(within(row).getByLabelText('Limit override for Acme HVAC'), { target: { value: '' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    const fd = m.save.mock.calls[0]![1] as FormData;
    expect(fd.get('clientId')).toBe('c1');
    expect(fd.get('spendLimitUsd')).toBe('');
    expect(fd.get('competitorLimit')).toBe('10');
    expect(fd.get('askMonthlyQuota')).toBe('100');
  });

  it('shows "Pause lifted." when the save lifted a pause', async () => {
    m.save.mockResolvedValue({ ok: true, message: 'Pause lifted.' });
    render(<ClientLimitsTable data={DATA} canEdit />);
    fireEvent.click(within(screen.getByRole('row', { name: /Acme HVAC/ })).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Pause lifted.')).toBeTruthy();
  });

  it('viewers get a read-only table (no inputs, no Save)', () => {
    render(<ClientLimitsTable data={DATA} canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByLabelText('Limit override for Acme HVAC')).toBeNull();
    expect(screen.getByRole('row', { name: /Acme HVAC/ }).textContent).toContain('100');
  });

  it('a read-only session hides the controls', () => {
    render(<ReadOnlyProvider readOnly><ClientLimitsTable data={DATA} canEdit /></ReadOnlyProvider>);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
