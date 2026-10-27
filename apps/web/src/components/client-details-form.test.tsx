// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';
import { ClientDetailsForm } from './client-details-form';

afterEach(cleanup);

const C = '22222222-2222-4222-8222-222222222222';
const INITIAL = {
  phone: '(817) 555-0142', address: { line1: '500 W Pearl St', city: 'Granbury', region: 'TX', postalCode: '76048', country: 'US' as const },
  logoUrl: null, contactName: 'Gina Owner', contactEmail: 'gina@granbury.example',
};

describe('ClientDetailsForm (final fix I3)', () => {
  it('shows the stored phone, address and owner contact, and saves them through the action', async () => {
    const action = vi.fn(async () => ({ ok: true as const, message: 'Details saved.' }));
    render(<ClientDetailsForm clientId={C} initial={INITIAL} action={action} />);
    expect(screen.getByRole('heading', { name: 'Business details' })).toBeTruthy();
    expect((screen.getByLabelText(/^Phone/) as HTMLInputElement).value).toBe('(817) 555-0142');
    expect((screen.getByLabelText('Street address') as HTMLInputElement).value).toBe('500 W Pearl St');
    expect((screen.getByLabelText(/^Owner name/) as HTMLInputElement).value).toBe('Gina Owner');
    expect((screen.getByLabelText(/^Owner email/) as HTMLInputElement).value).toBe('gina@granbury.example');
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '(817) 555-0199' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const fd = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(fd.get('clientId')).toBe(C);
    expect(fd.get('phone')).toBe('(817) 555-0199');
    expect(fd.get('contactEmail')).toBe('gina@granbury.example');
    expect(await screen.findByText('Details saved.')).toBeTruthy();
  });

  it('under hold or support (read-only): fields disabled, no Save', () => {
    render(<ReadOnlyProvider readOnly><ClientDetailsForm clientId={C} initial={INITIAL} action={vi.fn()} /></ReadOnlyProvider>);
    expect(screen.getByLabelText(/^Phone/).matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save details' })).toBeNull();
  });
});
