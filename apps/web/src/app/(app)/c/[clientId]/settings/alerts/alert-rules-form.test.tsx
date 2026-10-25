// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';
import type { FormResult } from '@/server/forms';
import { AlertRulesForm } from './alert-rules-form';

const rules = { alert: 70, brief: 40, custom: false, defaults: { alert: 70, brief: 40 } };
afterEach(cleanup);

describe('AlertRulesForm', () => {
  it('posts both thresholds and keeps the message visible', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Alert rules saved.' }));
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={action} />);
    fireEvent.change(screen.getByLabelText('Instant alert from score'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Alert rules saved.')).toBeTruthy());
    const fd = action.mock.calls[0]![1];
    expect([fd.get('intent'), fd.get('alert'), fd.get('brief')]).toEqual([null, '60', '30']);
  });
  it('shows an error from the server', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: false as const, error: 'The brief threshold must be lower than the alert threshold.' }));
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={action} />);
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('lower than the alert'));
  });
  it('is read-only without edit rights', () => {
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit={false} action={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(/Instant alert from score 70/)).toBeTruthy();
  });
  it('tells only client roles to ask the agency; agency staff without edit rights get the facts only', () => {
    const view = (audience: 'client' | 'agency') => (
      <HelpProvider value={{ audience, names: { agency: 'Cool Comfort', assistant: 'Sunny' } }}>
        <AlertRulesForm clientId="c1" rules={rules} canEdit={false} action={vi.fn()} />
      </HelpProvider>
    );
    const { container, rerender } = render(view('client'));
    expect(container.textContent).toContain('Ask Cool Comfort to change these.');
    rerender(view('agency'));
    expect(container.textContent).toContain('Instant alert from score 70; weekly brief from score 40.');
    expect(container.textContent).not.toContain('Ask Cool Comfort');
  });
  it('offers the defaults button only for custom thresholds', () => {
    const { rerender } = render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Use the defaults/ })).toBeNull();
    rerender(<AlertRulesForm clientId="c1" rules={{ ...rules, alert: 80, custom: true }} canEdit action={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Use the defaults (70/40)' })).toBeTruthy();
  });
});

describe('AlertRulesForm bar and SaveBar', () => {
  it('band bar follows typed values', () => {
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={vi.fn()} />);
    expect(screen.getByText('40–69')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '20' } });
    expect(screen.getByText('20–69')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('20 to 69: weekly brief');
  });
  it('Discard restores the saved bar, also after an invalid pair', () => {
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '90' } });
    expect(screen.getByText('20–69')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByText('40–69')).toBeTruthy();
    expect((screen.getByLabelText('Weekly brief from score') as HTMLInputElement).value).toBe('40');
  });
  it('a successful reset to defaults moves the bar to the default pair', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Alert rules reset.' }));
    render(<AlertRulesForm clientId="c1" rules={{ alert: 80, brief: 50, custom: true, defaults: { alert: 70, brief: 40 } }} canEdit action={action} />);
    expect(screen.getByText('50–79')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use the defaults (70/40)' }));
    expect(await screen.findByText('40–69')).toBeTruthy();
  });
  it('keeps the last valid bar while the pair is invalid', () => {
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '90' } });
    expect(screen.getByText('40–69')).toBeTruthy();
  });
  it('shows Save only once the form is dirty, and hides it after a successful save', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Alert rules saved.' }));
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={action} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Instant alert from score'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Alert rules saved.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect((screen.getByLabelText('Instant alert from score') as HTMLInputElement).value).toBe('80');
  });
  it('a refused save keeps the typed values and the bar', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: false as const, error: 'no' }));
    render(<AlertRulesForm clientId="c1" rules={rules} canEdit action={action} />);
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no'));
    expect((screen.getByLabelText('Weekly brief from score') as HTMLInputElement).value).toBe('90');
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});
