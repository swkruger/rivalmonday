// @vitest-environment jsdom
import { READ_ONLY_SESSION_MESSAGE } from '@cs/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';

const m = vi.hoisted(() => ({ toggle: vi.fn(), test: vi.fn(), del: vi.fn() }));
vi.mock('./actions', () => ({
  addWebhookAction: vi.fn(),
  toggleWebhookAction: (...a: unknown[]) => m.toggle(...a),
  testWebhookAction: (...a: unknown[]) => m.test(...a),
  deleteWebhookAction: (...a: unknown[]) => m.del(...a),
}));
const { AddWebhookForm, testResultLine, WebhookTable, WebhookToggle } = await import('./webhook-controls');

const SLACK = { id: 'w1', kind: 'slack' as const, host: 'hooks.slack.com', kinds: null, active: true };
const TEAMS = { id: 'w2', kind: 'teams' as const, host: 'acme.webhook.office.com', kinds: ['brief_ready', 'am_alert'], active: false };
beforeEach(() => { m.toggle.mockReset(); m.test.mockReset(); m.del.mockReset(); });

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

  it('toggle reverts on failure', async () => {
    m.toggle.mockResolvedValue({ ok: false, error: 'Not found' });
    render(<WebhookToggle id="w1" active label="Slack webhook active" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Slack webhook active' }));
    });
    expect(screen.getByRole('switch', { name: 'Slack webhook active' }).getAttribute('aria-checked')).toBe('true');
    expect((await screen.findByRole('alert')).textContent).toBe('Not found');
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

describe('testResultLine', () => {
  it('words every outcome (sign-off copy)', () => {
    expect(testResultLine('slack', { ok: true, status: 200 })).toEqual({ ok: true, text: 'Test sent — Slack answered 200.' });
    expect(testResultLine('teams', { ok: false, error: 'timeout' })).toEqual({ ok: false, text: "Test failed — Teams didn't answer within 5 seconds." });
    expect(testResultLine('slack', { ok: false, error: 'blocked' })).toEqual({ ok: false, text: "Test failed — this address isn't a Slack or Teams webhook." });
    expect(testResultLine('teams', { ok: false, status: 302, error: 'http' })).toEqual({ ok: false, text: 'Test failed — Teams answered 302.' });
    expect(testResultLine('slack', { ok: false, error: 'network' })).toEqual({ ok: false, text: "Test failed — couldn't reach Slack." });
  });
});

describe('WebhookTable', () => {
  it('kinds render labels', () => {
    render(<WebhookTable webhooks={[SLACK, TEAMS, { ...SLACK, id: 'w3', kinds: ['some_new_kind'] }]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Slack')).toBeTruthy();
    expect(within(rows[0]!).getByText('All agency notices')).toBeTruthy();
    expect(within(rows[0]!).getByText('On')).toBeTruthy();
    expect(within(rows[1]!).getByText('Microsoft Teams')).toBeTruthy();
    expect(within(rows[1]!).getByText('Brief ready for review, Client alerts (agency)')).toBeTruthy();
    expect(within(rows[1]!).getByText('Off')).toBeTruthy();
    expect(within(rows[2]!).getByText('Some new kind')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/brief_ready|am_alert/);
  });

  it('shows the test result under its own row', async () => {
    m.test.mockResolvedValue({ ok: true, result: { ok: true, status: 200 } });
    render(<WebhookTable webhooks={[SLACK, TEAMS]} />);
    const rows = screen.getAllByRole('row').slice(1);
    await act(async () => {
      fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Send test' }));
    });
    expect(m.test).toHaveBeenCalledWith({ id: 'w1' });
    expect(within(rows[0]!).getByRole('status').textContent).toBe('Test sent — Slack answered 200.');
    expect(within(rows[1]!).queryByRole('status')).toBeNull();
  });

  it('shows a refused test (rate limit) as an error line', async () => {
    m.test.mockResolvedValue({ ok: false, error: 'You can send another test in a few minutes.' });
    render(<WebhookTable webhooks={[TEAMS]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send test' }));
    });
    expect((await screen.findByRole('alert')).textContent).toBe('You can send another test in a few minutes.');
  });

  it('asks before deleting, naming the channel kind', async () => {
    m.del.mockResolvedValue({ ok: true });
    render(<WebhookTable webhooks={[TEAMS]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete this webhook?')).toBeTruthy();
    expect(within(dialog).getByText('Briefs and alerts stop going to this Teams channel. You can add it again later.')).toBeTruthy();
    expect(m.del).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    });
    expect(m.del).toHaveBeenCalledTimes(1);
    expect((m.del.mock.calls[0]![1] as FormData).get('webhookId')).toBe('w2');
  });

  it('hides Send test and Delete in a read-only support session', () => {
    render(<ReadOnlyProvider readOnly><WebhookTable webhooks={[SLACK]} /></ReadOnlyProvider>);
    expect(screen.queryByRole('button', { name: 'Send test' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByText('On')).toBeTruthy();
  });
});

describe('AddWebhookForm', () => {
  it('offers every agency notice by its label', () => {
    render(<AddWebhookForm />);
    expect(screen.getByLabelText('Brief ready for review')).toBeTruthy();
    expect(screen.getByLabelText('Contact bouncing')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
  });
});
