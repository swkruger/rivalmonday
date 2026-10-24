// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock('../actions', () => ({ resetAiPauseAction: (...a: unknown[]) => m.reset(...a) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
import { type SpendGuardData, SpendGuardPanel } from './spend-guard-panel';

afterEach(cleanup);

const DATA: SpendGuardData = {
  state: { state: 'paused', since: '2026-10-22T10:00:00.000Z', scope: 'total', observedUsd: 40, baselineUsd: 10 },
  scopes: [
    { scope: 'total', observedUsd: 40, baselineUsd: 10, ratioPercent: 300, floorOnly: false },
    { scope: 'openrouter', observedUsd: 2.5, baselineUsd: 1, ratioPercent: 150, floorOnly: true },
  ],
  pausedClients: [{ clientId: 'c1', clientName: 'Acme HVAC', agencyId: 'a1', agencyName: 'Agency One', spendPausedAt: '2026-10-20T00:00:00.000Z', spendUsd: 21, limitUsd: 15 }],
  events: [{ id: 'e1', kind: 'spike_paused', createdAt: '2026-10-22T10:00:00.000Z', scope: 'total', observedUsd: 40, baselineUsd: 10, limitUsd: null, actor: 'system', note: null }],
};

describe('SpendGuardPanel', () => {
  it('viewer sees panel without Reset', () => {
    render(<SpendGuardPanel data={DATA} canReset={false} />);
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getAllByText('all providers').length).toBeGreaterThan(0);
    expect(screen.getByText('OpenRouter')).toBeTruthy();
    expect(screen.getByText('floor')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Agency One' }).getAttribute('href')).toBe('/platform/agencies/a1');
    expect(screen.getByText('Spike pause')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('staff sees Reset only when the guard is not ok', () => {
    const { rerender } = render(<SpendGuardPanel data={DATA} canReset />);
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
    rerender(<SpendGuardPanel data={{ ...DATA, state: { state: 'ok' } }} canReset />);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('reset requires a note', async () => {
    m.reset.mockResolvedValue({ ok: true, message: 'Guard reset.' });
    render(<SpendGuardPanel data={DATA} canReset />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    const note = (await screen.findByLabelText(/Note/)) as HTMLTextAreaElement;
    expect(note.required).toBe(true);
    expect(note.maxLength).toBe(200);
    fireEvent.change(note, { target: { value: 'Checked the spike, it was a backfill' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reset' }));
    await waitFor(() => expect(m.reset).toHaveBeenCalledTimes(1));
    expect((m.reset.mock.calls[0]![1] as FormData).get('note')).toBe('Checked the spike, it was a backfill');
    expect(await screen.findByText('Guard reset.')).toBeTruthy();
  });
});
