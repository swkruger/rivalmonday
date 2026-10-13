// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ startSupportSessionAction: vi.fn(async () => ({ ok: true })) }));
const { SupportDialog } = await import('./support-dialog');

describe('SupportDialog', () => {
  it('asks for a reason shown to the agency and enables "Start read-only session" only from 5 characters', () => {
    render(<SupportDialog agencyId="ag" />);
    fireEvent.click(screen.getByRole('button', { name: 'View as agency' }));
    const reason = screen.getByLabelText('Why are you opening this agency? (shown to the agency)');
    const submit = screen.getByRole('button', { name: 'Start read-only session' }) as HTMLButtonElement;
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(submit.disabled).toBe(true);
    fireEvent.change(reason, { target: { value: '  abcd  ' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(reason, { target: { value: 'abcde' } });
    expect(submit.disabled).toBe(false);
    expect(reason.hasAttribute('required')).toBe(true);
  });
});
