// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useActionState: () => [{ ok: true }, vi.fn(), false] }));
const { ClientProfileForm } = await import('./client-profile-form');

const verticals = [
  { id: 'hvac_plumbing', name: 'HVAC & Plumbing', services: [{ id: 'ac_tune_up', name: 'AC tune-up' }] },
  { id: 'dental', name: 'Dental', services: [{ id: 'cleaning', name: 'Cleaning' }] },
];

describe('ClientProfileForm', () => {
  it('shows the services of the chosen vertical when creating', () => {
    render(<ClientProfileForm mode="create" action={vi.fn()} verticals={verticals} timezoneOptions={['America/Chicago']} />);
    expect(screen.getByLabelText('AC tune-up')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Business type'), { target: { value: 'dental' } });
    expect(screen.queryByLabelText('AC tune-up')).toBeNull();
    expect(screen.getByLabelText('Cleaning')).toBeTruthy();
  });

  it('15a §2.10: never names the product (the form is on the client-visible profile page)', () => {
    const { container } = render(<ClientProfileForm mode="create" action={vi.fn()} verticals={verticals} timezoneOptions={['America/Chicago']} />);
    expect(container.textContent).not.toMatch(/rival[\s-]*monday/i);
    expect(container.textContent).toContain('Lets us benchmark the business’s own reviews against its competitors.');
  });

  it('carries a custom submit label in create mode', () => {
    render(<ClientProfileForm mode="create" submitLabel="Create prospect" action={vi.fn()} verticals={verticals} timezoneOptions={['America/Chicago']} />);
    expect(screen.getByRole('button', { name: 'Create prospect' })).toBeTruthy();
  });

  it('untouched custom radius keeps the stored km', () => {
    const initial = { name: 'Comfort Air', verticalId: 'hvac_plumbing', services: [], keywords: [], placeId: null, serviceArea: { center: { lat: 33.95, lng: -84.33 }, radiusKm: 15, zips: ['30338'] } };
    const { container } = render(<ClientProfileForm mode="edit" action={vi.fn()} verticals={verticals} clientId="c1" initial={initial} />);
    const sel = screen.getByLabelText('Service area radius') as HTMLSelectElement;
    expect(sel.options[0]?.textContent).toBe('≈ 9 mi (custom)');
    expect(new FormData(container.querySelector('form') as HTMLFormElement).get('radiusKm')).toBe('15');
  });

  it('defaults to 10 mi and choosing 25 mi saves 40', () => {
    const { container } = render(<ClientProfileForm mode="create" action={vi.fn()} verticals={verticals} timezoneOptions={['America/Chicago']} />);
    const form = container.querySelector('form') as HTMLFormElement;
    expect(new FormData(form).get('radiusKm')).toBe('16.1');
    fireEvent.change(screen.getByLabelText('Service area radius'), { target: { value: '40' } });
    expect(new FormData(form).get('radiusKm')).toBe('40');
  });

  it('fixes the vertical and pre-fills values when editing', () => {
    render(
      <ClientProfileForm mode="edit" action={vi.fn()} verticals={verticals} clientId="c1"
        initial={{ name: 'Comfort Air', verticalId: 'hvac_plumbing', services: ['ac_tune_up'], keywords: ['ac repair'], placeId: null,
          serviceArea: { center: { lat: 33.95, lng: -84.33 }, radiusKm: 15, zips: ['30338'] } }} />,
    );
    expect(screen.queryByLabelText('Vertical')).toBeNull();
    expect((screen.getByLabelText('AC tune-up') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/centre/i) as HTMLInputElement).value).toBe('33.95, -84.33');
  });
});
