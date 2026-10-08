// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormResult } from '@/server/forms';
import { ThemeQueue } from './theme-queue';

const p = { id: 'p1', verticalId: 'hvac_plumbing', verticalName: 'HVAC & Plumbing', themeId: 'hidden_fees', name: 'Hidden fees', description: 'Unexpected fees', status: 'proposed' as const, otherCount: 14, createdAt: '2026-10-07T00:00:00.000Z', decidedAt: null, samples: ['They charged a trip fee.'] };

describe('ThemeQueue', () => {
  it('approves a proposal and keeps the message after it moves to the decided list', async () => {
    // Typed with (prev, fd) params (unused) so `action.mock.calls[0]![1]` below is typed as FormData, matching `ThemeQueue`'s action prop.
    const action = vi.fn(async (_prev: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Approved “Hidden fees”.' }));
    const { rerender } = render(<ThemeQueue pending={[p]} decided={[]} action={action} />);
    expect(screen.getByText('They charged a trip fee.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve Hidden fees' }));
    await waitFor(() => expect(screen.getByText('Approved “Hidden fees”.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('proposalId'), fd.get('decision'), fd.get('name')]).toEqual(['p1', 'approved', 'Hidden fees']);
    rerender(<ThemeQueue pending={[]} decided={[{ ...p, status: 'approved', decidedAt: '2026-10-07T01:00:00.000Z' }]} action={action} />);
    expect(screen.getByText('Approved “Hidden fees”.')).toBeTruthy();
  });
});
