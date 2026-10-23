// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmForm } from './confirm-form';

afterEach(cleanup);

const form = (action: ReturnType<typeof vi.fn>) => (
  <ConfirmForm action={action} submit="Extend trial" title="Extend the free trial?" body="The trial runs until the date you chose." confirmLabel="Extend trial">
    <label htmlFor="until">New trial end</label>
    <input id="until" name="until" type="date" required />
  </ConfirmForm>
);

describe('ConfirmForm', () => {
  it('does not open the dialog while a required field is empty', () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(form(action));
    fireEvent.click(screen.getByRole('button', { name: 'Extend trial' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it('opens once the form is valid and posts the field values on confirm', async () => {
    const action = vi.fn(async (_p: unknown, _fd: FormData) => ({ ok: true as const, message: 'Trial extended.' }));
    render(form(action));
    fireEvent.change(screen.getByLabelText('New trial end'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extend trial' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Extend trial' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((action.mock.calls[0]![1] as FormData).get('until')).toBe('2026-12-01');
    expect(await screen.findByText('Trial extended.')).toBeTruthy();
  });
});
