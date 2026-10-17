// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';

const saveRankSettings = vi.fn();
vi.mock('./actions', () => ({ saveRankSettings: (...a: unknown[]) => saveRankSettings(...a), requestRankScan: vi.fn() }));
const { RankSettingsSheet } = await import('./rank-settings-sheet');

const ALL = ['ac repair', 'furnace repair', 'hvac', 'heat pump', 'duct cleaning', 'water heater'];
const settings = { keywords: ALL.slice(0, 4), allKeywords: ALL, gridSize: 7 as const, radiusKm: 25 };
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Rank settings' }));

beforeEach(() => saveRankSettings.mockReset());
afterEach(cleanup);

describe('RankSettingsSheet', () => {
  it('sheet caps keywords at 5', () => {
    render(<RankSettingsSheet clientId="c1" settings={settings} />);
    open();
    expect(screen.getByRole('dialog', { name: 'Rank settings' })).toBeTruthy();
    expect(ALL.slice(0, 4).every((k) => box(k).checked)).toBe(true);
    expect(box('water heater').disabled).toBe(false);
    fireEvent.click(box('duct cleaning'));
    expect(box('duct cleaning').checked).toBe(true);
    expect(box('water heater').disabled).toBe(true); // the sixth box is disabled at 5
    expect(box('ac repair').disabled).toBe(false); // a checked box can still be cleared
    fireEvent.click(box('ac repair'));
    expect(box('water heater').disabled).toBe(false);
  });

  it('starts from the saved grid size and radius', () => {
    render(<RankSettingsSheet clientId="c1" settings={{ ...settings, gridSize: 5, radiusKm: 12.5 }} />);
    open();
    expect((screen.getByRole('radio', { name: '5×5' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: '7×7' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Radius (km)') as HTMLInputElement).value).toBe('12.5');
  });

  it('saves the chosen settings, closes, and shows the saved message outside the sheet', async () => {
    saveRankSettings.mockResolvedValue({ ok: true, message: 'Saved. The next scan uses these settings.' });
    render(<RankSettingsSheet clientId="c1" settings={settings} />);
    open();
    fireEvent.click(box('hvac'));
    fireEvent.click(screen.getByRole('radio', { name: '5×5' }));
    fireEvent.change(screen.getByLabelText('Radius (km)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved. The next scan uses these settings.'));
    expect(saveRankSettings).toHaveBeenCalledWith('c1', { keywords: ['ac repair', 'furnace repair', 'heat pump'], gridSize: 5, radiusKm: 15 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the sheet open with the choices intact on a refusal', async () => {
    saveRankSettings.mockResolvedValue({ ok: false, error: 'Set a service area on the Profile page first.' });
    render(<RankSettingsSheet clientId="c1" settings={settings} />);
    open();
    fireEvent.click(screen.getByRole('radio', { name: '5×5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Set a service area on the Profile page first.'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByRole('radio', { name: '5×5' }) as HTMLInputElement).checked).toBe(true);
  });

  it('is hidden in a read-only support session', () => {
    render(<ReadOnlyProvider readOnly><RankSettingsSheet clientId="c1" settings={settings} /></ReadOnlyProvider>);
    expect(screen.queryByRole('button', { name: 'Rank settings' })).toBeNull();
  });
});
