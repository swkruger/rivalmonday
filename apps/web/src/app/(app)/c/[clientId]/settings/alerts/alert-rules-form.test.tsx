// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormResult } from '@/server/forms';
import { AlertRulesForm } from './alert-rules-form';

const rules = { alert: 70, brief: 40, custom: false, defaults: { alert: 70, brief: 40 } };

describe('AlertRulesForm', () => {
  it('posts both thresholds and keeps the message visible', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Alert rules saved.' }));
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={action} />);
    fireEvent.change(screen.getByLabelText('Instant alert from score'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Alert rules saved.')).toBeTruthy());
    const fd = action.mock.calls[0]![1];
    expect([fd.get('intent'), fd.get('alert'), fd.get('brief')]).toEqual(['save', '60', '30']);
  });
  it('shows an error from the server', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: false as const, error: 'The brief threshold must be lower than the alert threshold.' }));
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('lower than the alert'));
  });
  it('is read-only without edit rights', () => {
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit={false} action={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(/Instant alert from score 70/)).toBeTruthy();
  });
  it('offers the defaults button only for custom thresholds', () => {
    const { rerender } = render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Use the defaults/ })).toBeNull();
    rerender(<AlertRulesForm clientId="c1" rules={{ ...rules, alert: 80, custom: true }} canEdit action={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Use the defaults (70/40)' })).toBeTruthy();
  });
});
