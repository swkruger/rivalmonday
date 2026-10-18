// @vitest-environment jsdom
import { READ_ONLY_SESSION_MESSAGE } from '@cs/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ toggle: vi.fn() }));
vi.mock('./actions', () => ({ addWebhookAction: vi.fn(), toggleWebhookAction: (...a: unknown[]) => m.toggle(...a) }));
const { WebhookToggle } = await import('./webhook-controls');

describe('WebhookToggle', () => {
  it('shows a refusal returned by the action (8b M3) instead of failing silently', async () => {
    m.toggle.mockResolvedValue({ ok: false, error: READ_ONLY_SESSION_MESSAGE });
    render(<WebhookToggle id="w1" active label="Slack webhook active" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Slack webhook active' }));
    });
    expect(m.toggle).toHaveBeenCalledWith({ id: 'w1', active: false });
    expect((await screen.findByRole('alert')).textContent).toBe(READ_ONLY_SESSION_MESSAGE);
  });

  it('shows no message when the toggle succeeds', async () => {
    m.toggle.mockResolvedValue({ ok: true });
    render(<WebhookToggle id="w2" active={false} label="Teams webhook active" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Teams webhook active' }));
    });
    expect(m.toggle).toHaveBeenCalledWith({ id: 'w2', active: true });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
