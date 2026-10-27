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
    expect(screen.getByRole('form', { name: 'Business details' })).toBeTruthy();
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

  it('shows Save details only after a change; Discard restores the values and hides it', () => {
    render(<ClientDetailsForm clientId={C} initial={INITIAL} action={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save details' })).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '000' } });
    expect(screen.getByRole('button', { name: 'Save details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect((screen.getByLabelText(/^Phone/) as HTMLInputElement).value).toBe('(817) 555-0142');
    expect(screen.queryByRole('button', { name: 'Save details' })).toBeNull();
  });

  it('Discard clears a chosen logo file', () => {
    render(<ClientDetailsForm clientId={C} initial={INITIAL} action={vi.fn()} />);
    const file = screen.getByLabelText(/^Logo/) as HTMLInputElement;
    // jsdom cannot hold a real FileList, so watch the reset the form must perform: `value = ''`.
    const writes: string[] = [];
    Object.defineProperty(file, 'value', { configurable: true, get: () => '', set: (x: string) => { writes.push(x); } });
    fireEvent.change(file, { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(writes).toEqual(['']);
  });

  it('a refused save keeps the typed values', async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: 'Nope.' }));
    render(<ClientDetailsForm clientId={C} initial={INITIAL} action={action} />);
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect((screen.getByLabelText(/^Phone/) as HTMLInputElement).value).toBe('111');
  });

  it('under hold or support (read-only): fields disabled, no Save', () => {
    render(<ReadOnlyProvider readOnly><ClientDetailsForm clientId={C} initial={INITIAL} action={vi.fn()} /></ReadOnlyProvider>);
    expect(screen.getByLabelText(/^Phone/).matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save details' })).toBeNull();
  });
});
