// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('./actions', () => ({ saveClientLimitsAction: (...a: unknown[]) => m.save(...a) }));
import { ReadOnlyProvider } from '@/components/read-only';
import { type ClientLimits, ClientLimitsTable } from './client-limits';

afterEach(() => {
  cleanup();
  m.save.mockReset();
});

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

  it('one Save for the table: no per-row Save, and the save bar appears only once a field changes', () => {
    render(<ClientLimitsTable data={DATA} canEdit />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Competitor limit for Bright Dental'), { target: { value: '9' } });
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeTruthy();
    // Back to the stored value: clean again.
    fireEvent.change(screen.getByLabelText('Competitor limit for Bright Dental'), { target: { value: '8' } });
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
  });

  it('saves only the changed rows; a blank override clears it', async () => {
    m.save.mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<ClientLimitsTable data={DATA} canEdit />);
    fireEvent.change(screen.getByLabelText('Limit override for Acme HVAC'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    const fd = m.save.mock.calls[0]![1] as FormData;
    expect(JSON.parse(String(fd.get('rows')))).toEqual([{ clientId: 'c1', name: 'Acme HVAC', spendLimitUsd: '', competitorLimit: '10', askMonthlyQuota: '100' }]);
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('posts every changed row in one save', async () => {
    m.save.mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<ClientLimitsTable data={DATA} canEdit />);
    fireEvent.change(screen.getByLabelText('Ask quota for Acme HVAC'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Limit override for Bright Dental'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    const rows = JSON.parse(String((m.save.mock.calls[0]![1] as FormData).get('rows'))) as { clientId: string }[];
    expect(rows.map((r) => r.clientId)).toEqual(['c1', 'c2']);
  });

  it('Discard restores the stored values and hides the bar', () => {
    render(<ClientLimitsTable data={DATA} canEdit />);
    fireEvent.change(screen.getByLabelText('Ask quota for Acme HVAC'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect((screen.getByLabelText('Ask quota for Acme HVAC') as HTMLInputElement).value).toBe('100');
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    expect(m.save).not.toHaveBeenCalled();
  });

  it('shows the one result line: a lifted pause, or the first refusal with its client and the edit kept', async () => {
    m.save.mockResolvedValue({ ok: true, message: 'Saved. Pause lifted for Acme HVAC.' });
    const { unmount } = render(<ClientLimitsTable data={DATA} canEdit />);
    fireEvent.change(screen.getByLabelText('Limit override for Acme HVAC'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved. Pause lifted for Acme HVAC.')).toBeTruthy();
    unmount();
    m.save.mockResolvedValue({ ok: false, error: 'Bright Dental: Competitor limit and Ask quota must be whole numbers.' });
    render(<ClientLimitsTable data={DATA} canEdit />);
    fireEvent.change(screen.getByLabelText('Competitor limit for Bright Dental'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Bright Dental: Competitor limit and Ask quota must be whole numbers.')).toBeTruthy();
    expect((screen.getByLabelText('Competitor limit for Bright Dental') as HTMLInputElement).value).toBe('9');
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeTruthy();
  });

  it('viewers get a read-only table (no inputs, no Save)', () => {
    render(<ClientLimitsTable data={DATA} canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByLabelText('Limit override for Acme HVAC')).toBeNull();
    expect(screen.getByRole('row', { name: /Acme HVAC/ }).textContent).toContain('100');
  });

  it('a read-only session hides the controls', () => {
    render(<ReadOnlyProvider readOnly><ClientLimitsTable data={DATA} canEdit /></ReadOnlyProvider>);
    expect(screen.queryByLabelText('Limit override for Acme HVAC')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });
});
