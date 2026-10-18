// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormResult } from '@/server/forms';
import { ClientFeaturesForm } from './client-features-form';

describe('ClientFeaturesForm review toggle', () => {
  const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Features saved.' }));
  it('names the AI connection switch after its settings page (15a)', () => {
    render(<ClientFeaturesForm clientId="c1" features={['mcp']} action={action} role="account_manager" />);
    expect(screen.getByText('AI connection')).toBeTruthy();
    expect(screen.getByText('Shows the AI connection settings page.')).toBeTruthy();
    expect(screen.queryByText(/coming soon/)).toBeNull();
  });

  it('review toggle hidden for account_manager and client roles', () => {
    for (const role of ['account_manager', 'client_owner', 'client_viewer'] as const) {
      const { unmount } = render(<ClientFeaturesForm clientId="c1" features={['ask']} action={action} role={role} reviewAllowed />);
      expect(screen.queryByLabelText(/Allow review to improve answers/)).toBeNull();
      unmount();
    }
  });
  it('shows the ask switch and, for agency_admin, an editable review toggle posted with the form', async () => {
    render(<ClientFeaturesForm clientId="c1" features={['ask']} action={action} role="agency_admin" reviewAllowed />);
    expect((screen.getByLabelText(/^Ask assistant/) as HTMLInputElement).checked).toBe(true);
    const review = screen.getByLabelText(/Allow review to improve answers/) as HTMLInputElement;
    expect(review.checked).toBe(true);
    fireEvent.click(review);
    fireEvent.click(screen.getByRole('button', { name: 'Save features' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const fd = action.mock.calls.at(-1)![1];
    expect(fd.get('askReviewPresent')).toBe('1');
    expect(fd.get('askReviewAllowed')).toBeNull();
    expect(fd.getAll('feature')).toEqual(['ask']);
  });
});

describe('ClientFeaturesForm', () => {
  it('shows the current features and posts the checked ones', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Features saved.' }));
    render(<ClientFeaturesForm clientId="c1" features={['dashboard']} action={action} />);
    expect((screen.getByLabelText(/Client dashboard/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Alert rules/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText(/Alert rules/));
    fireEvent.click(screen.getByLabelText(/Manage competitors/));
    fireEvent.click(screen.getByRole('button', { name: 'Save features' }));
    await waitFor(() => expect(screen.getByText('Features saved.')).toBeTruthy());
    const fd = action.mock.calls[0]![1];
    expect(fd.get('clientId')).toBe('c1');
    expect(fd.getAll('feature').sort()).toEqual(['alert_rules', 'dashboard', 'manage_competitors']);
  });

  it('keeps a feature that has no switch yet', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Features saved.' }));
    render(<ClientFeaturesForm clientId="c1" features={['ask']} action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save features' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]![1].getAll('feature')).toEqual(['ask']);
  });

  it('shows an error from the server', async () => {
    const action = vi.fn(async (_p: FormResult, _fd: FormData) => ({ ok: false as const, error: 'Client not found' }));
    render(<ClientFeaturesForm clientId="c1" features={[]} action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save features' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Client not found'));
  });
});
