// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesAreaSummary } from './services-area-summary';

const base = { services: ['ac_repair'], keywords: ['ac repair'], placeId: 'p1' };

describe('ServicesAreaSummary', () => {
  it('lists services, keywords and the area', () => {
    render(
      <ServicesAreaSummary
        profile={{ ...base, serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 25, zips: ['1', '2', '3'], towns: ['Granbury'] } }}
        serviceNames={{ ac_repair: 'AC repair' }}
      />,
    );
    for (const t of ['AC repair', 'ac repair', 'Linked']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText(/25 km around the business/)).toBeTruthy();
    expect(screen.getByText(/3 ZIP codes/)).toBeTruthy();
    expect(screen.getByText(/Granbury/)).toBeTruthy();
  });
  it('says so when there is no service area', () => {
    render(<ServicesAreaSummary profile={{ ...base, placeId: null, serviceArea: null }} serviceNames={{}} />);
    expect(screen.getByText('No service area set yet.')).toBeTruthy();
    expect(screen.getByText('Not linked')).toBeTruthy();
  });
});
