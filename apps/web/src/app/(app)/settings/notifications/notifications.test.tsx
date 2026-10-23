// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ setPref: vi.fn(), update: vi.fn() }));
vi.mock('./actions', () => ({ setPrefAction: m.setPref, updateContactAction: m.update }));

const { ContactForm } = await import('./contact-form');
const { PrefSwitch } = await import('./pref-switch');
afterEach(() => { cleanup(); m.setPref.mockReset(); m.update.mockReset(); });

describe('notifications', () => {
  it('notifications ids are unique across cards', () => {
    const { container } = render(
      <>
        <ContactForm contactId="c1" timezone={null} quietHours={null} timezoneOptions={['UTC']} />
        <ContactForm contactId="c2" timezone={null} quietHours={null} timezoneOptions={['UTC']} />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('[id]')).map((e) => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('c1-timezone');
    expect(ids).toContain('c2-quiet-start');
    expect(screen.getAllByLabelText('Time zone')).toHaveLength(2);
  });

  it('pref switch reverts and shows the error on failure', async () => {
    m.setPref.mockResolvedValue({ ok: false, error: 'Could not save that preference.' });
    render(<PrefSwitch contactId="c1" kind="alert" channel="email" enabled={false} label="Alerts, email" />);
    const sw = screen.getByRole('switch', { name: 'Alerts, email' });
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not save that preference.'));
    expect(m.setPref).toHaveBeenCalledWith({ contactId: 'c1', kind: 'alert', channel: 'email', enabled: true });
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Alerts, email' }).getAttribute('aria-checked')).toBe('false'));
  });

  it('shows Saved. after a quiet-hours save', async () => {
    m.update.mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<ContactForm contactId="c1" timezone={null} quietHours={null} timezoneOptions={['UTC']} />);
    fireEvent.change(screen.getByLabelText('Quiet hours start'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('Quiet hours end'), { target: { value: '07:00' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved.'));
  });
});
