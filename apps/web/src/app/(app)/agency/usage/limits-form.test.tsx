// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormResult } from '@/server/forms';
import { LimitsForm } from './limits-form';

describe('LimitsForm', () => {
  it('posts the client id, cap and limit and keeps the result message visible', async () => {
    // Typed with (prev, fd) params (unused) so `action.mock.calls[0]![1]` below is typed as FormData, matching `LimitsForm`'s action prop.
    const action = vi.fn(async (_prev: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Limits saved.' }));
    render(<LimitsForm action={action} clientId="c1" clientName="A1 HVAC" capUsd={15} competitorLimit={5} />);
    fireEvent.change(screen.getByLabelText('Monthly cap for A1 HVAC (USD)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Competitor limit for A1 HVAC'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits for A1 HVAC' }));
    await waitFor(() => expect(screen.getByText('Limits saved.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('clientId'), fd.get('monthlyCapUsd'), fd.get('competitorLimit')]).toEqual(['c1', '25', '7']);
  });
});
