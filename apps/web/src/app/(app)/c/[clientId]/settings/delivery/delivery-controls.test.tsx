// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const a = vi.hoisted(() => ({ save: vi.fn(), deactivate: vi.fn() }));
vi.mock('./actions', () => ({ saveDeliveryAction: a.save, addRecipientAction: vi.fn(), deactivateRecipientAction: a.deactivate }));

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const { DeliveryForm, DeactivateRecipientButton } = await import('./delivery-controls');

beforeEach(() => { a.save.mockReset(); a.deactivate.mockReset(); });
afterEach(cleanup);

const form = () => <DeliveryForm clientId="c1" alertMode="after_am_check" briefAutoSend={false} timezone="UTC" timezoneOptions={['UTC']} />;

describe('DeliveryForm alert modes', () => {
  it('labels the default alert mode "I review alerts first", never "After AM check"', () => {
    render(form());
    expect(screen.getByText(/I review alerts first/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/AM check/);
  });
  it('digest copy names the business time zone', () => {
    render(form());
    expect(screen.getByText('Alerts wait for the 17:00 digest (business time zone).')).toBeTruthy();
  });
  it('auto-send switch has a label', () => {
    render(form());
    expect(screen.getByRole('switch', { name: 'Send untouched briefs automatically on Monday 07:00' })).toBeTruthy();
  });
  it('shows Save only once the form is dirty', () => {
    render(form());
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Digest only/ }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
  it('delivery: refused save keeps the chosen mode; success hides the bar and keeps "Saved"', async () => {
    a.save.mockResolvedValueOnce({ ok: false, error: 'Nope' });
    render(form());
    fireEvent.click(screen.getByRole('radio', { name: /Digest only/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nope'));
    expect((screen.getByRole('radio', { name: /Digest only/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();

    a.save.mockResolvedValueOnce({ ok: true, message: 'Delivery settings saved.' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Delivery settings saved.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect((screen.getByRole('radio', { name: /Digest only/ }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('DeactivateRecipientButton', () => {
  it('deactivate: cancel does nothing', async () => {
    render(<DeactivateRecipientButton clientId="c1" contactId="k1" email="a@b.co" />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Deactivate a@b.co?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(a.deactivate).not.toHaveBeenCalled();
  });
  it('confirm deactivates and a refusal shows under the row', async () => {
    a.deactivate.mockResolvedValueOnce({ ok: false, error: 'Cannot deactivate the last owner.' });
    render(<DeactivateRecipientButton clientId="c1" contactId="k1" email="a@b.co" />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('last owner'));
    const fd = a.deactivate.mock.calls[0]![1] as FormData;
    expect([fd.get('clientId'), fd.get('contactId')]).toEqual(['c1', 'k1']);
  });
});
