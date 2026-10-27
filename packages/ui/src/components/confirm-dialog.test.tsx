// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

afterEach(cleanup);

const base = { title: 'Remove it?', body: 'Gone.', confirmLabel: 'Remove', action: vi.fn() };

describe('ConfirmDialog (controlled)', () => {
  it('renders open without a trigger', () => {
    render(<ConfirmDialog {...base} open onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('renders error in a role=alert region', () => {
    render(<ConfirmDialog {...base} open onOpenChange={() => {}} error="Nope" />);
    expect(screen.getByRole('alert').textContent).toContain('Nope');
  });

  it('renders children inside the form', () => {
    render(<ConfirmDialog {...base} open onOpenChange={() => {}}><input aria-label="Name" /></ConfirmDialog>);
    expect(screen.getByLabelText('Name').closest('form')).toBeTruthy();
  });

  it('keeps the action disabled until the typed text matches', () => {
    render(<ConfirmDialog {...base} open onOpenChange={() => {}} requireText="Acme" />);
    const btn = screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type Acme to confirm'), { target: { value: 'Acme' } });
    expect(btn.disabled).toBe(false);
  });

  it('uses the destructive variant only for tone=danger', () => {
    const { rerender } = render(<ConfirmDialog {...base} open onOpenChange={() => {}} tone="danger" />);
    expect(screen.getByRole('button', { name: 'Remove' }).getAttribute('data-variant')).toBe('destructive');
    rerender(<ConfirmDialog {...base} open onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Remove' }).getAttribute('data-variant')).toBe('default');
  });
});
