// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../actions', () => ({ updateSpendGuardSettingsAction: (...a: unknown[]) => m.save(...a) }));
import { SpendGuardSettings } from './spend-guard-settings';

afterEach(cleanup);

const SETTINGS = {
  creditsPerUsd: 100, clientMonthlyLimitUsd: 15, clientPausePercent: 130, spikeWarnPercent: 100,
  spikePausePercent: 200, spikeFloorUsdPerDay: 5, spikeFloorUsdPerClientDay: 0.5, spikeSnoozeHours: 24,
};

describe('SpendGuardSettings', () => {
  it('shows the credits rate and hides the save bar while clean', () => {
    render(<SpendGuardSettings settings={SETTINGS} />);
    expect(screen.getByText('100 credits = $1')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
  });

  it('settings form sends only changed fields', async () => {
    m.save.mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<SpendGuardSettings settings={SETTINGS} />);
    fireEvent.change(screen.getByLabelText(/Default client limit/), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/Snooze after a reset/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    const fd = m.save.mock.calls[0]![1] as FormData;
    expect([...fd.keys()].sort()).toEqual(['clientMonthlyLimitUsd', 'spikeSnoozeHours']);
    expect(fd.get('clientMonthlyLimitUsd')).toBe('20');
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('a change back to the stored value leaves the form clean', () => {
    render(<SpendGuardSettings settings={SETTINGS} />);
    const f = screen.getByLabelText(/Default client limit/);
    fireEvent.change(f, { target: { value: '20' } });
    fireEvent.change(f, { target: { value: '15' } });
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
  });
});
