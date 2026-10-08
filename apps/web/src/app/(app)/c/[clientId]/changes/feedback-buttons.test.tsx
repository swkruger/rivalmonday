// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormResult } from '@/server/forms';
import { FeedbackButtons } from './feedback-buttons';

describe('FeedbackButtons', () => {
  it('posts the verdict and keeps the result message visible', async () => {
    // Mechanical fix: typed params (vs. the brief's `async () => (...)`) so `calls[0][1]` type-checks as `FormData`.
    const action = vi.fn(async (_state: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Thanks — saved.' }));
    render(<FeedbackButtons clientId="c1" eventId="e1" current={null} action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Useful' }));
    await waitFor(() => expect(screen.getByText('Thanks — saved.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('clientId'), fd.get('eventId'), fd.get('verdict')]).toEqual(['c1', 'e1', 'useful']);
  });

  it('marks the current verdict as pressed', () => {
    render(<FeedbackButtons clientId="c1" eventId="e1" current="wrong" action={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Wrong' }).getAttribute('aria-pressed')).toBe('true');
  });
});
