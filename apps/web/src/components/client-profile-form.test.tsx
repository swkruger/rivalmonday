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
    fireEvent.change(screen.getByLabelText('Vertical'), { target: { value: 'dental' } });
    expect(screen.queryByLabelText('AC tune-up')).toBeNull();
    expect(screen.getByLabelText('Cleaning')).toBeTruthy();
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
