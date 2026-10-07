// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormResult } from '@/server/forms';
import { PlaybookEditor } from './playbook-editor';

const pb = { id: 'price_cut_bundle', trigger: 'price_change', packTitle: 'Answer a price cut', packTemplate: 'Bundle {{service}}.', title: 'Answer a price cut', template: 'Bundle {{service}}.', overridden: false, disabled: false, updatedAt: null };

describe('PlaybookEditor', () => {
  it('is read-only for non-admins', () => {
    render(<PlaybookEditor verticalId="hvac_plumbing" playbook={pb} canEdit={false} action={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(screen.getByText('Bundle {{service}}.')).toBeTruthy();
  });

  it('saves edits, shows the tool’s refusal, and offers reset only when overridden', async () => {
    // Typed with (prev, fd) params (unused) so `action.mock.calls[0]![1]` below is typed as FormData, matching `PlaybookEditor`'s action prop.
    const action = vi.fn(async (_prev: FormResult, _fd: FormData) => ({ ok: false as const, error: 'Unknown placeholder {{client}}' }));
    const { rerender } = render(<PlaybookEditor verticalId="hvac_plumbing" playbook={pb} canEdit action={action} />);
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'Hi {{client}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/\{\{client\}\}/));
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('verticalId'), fd.get('playbookId'), fd.get('template'), fd.get('intent')]).toEqual(['hvac_plumbing', 'price_cut_bundle', 'Hi {{client}}', 'save']);
    rerender(<PlaybookEditor verticalId="hvac_plumbing" playbook={{ ...pb, overridden: true }} canEdit action={action} />);
    expect(screen.getByRole('button', { name: /reset to standard/i })).toBeTruthy();
  });
});
