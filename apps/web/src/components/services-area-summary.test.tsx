// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesAreaSummary } from './services-area-summary';

const base = { services: ['ac_repair'], keywords: ['ac repair'], placeId: 'p1' };

describe('ServicesAreaSummary', () => {
  it('renders miles', () => {
    render(<ServicesAreaSummary profile={{ ...base, serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 16.1, zips: [] } }} serviceNames={{}} />);
    expect(screen.getByText(/10 miles around the business/)).toBeTruthy();
    expect(screen.queryByText(/km/)).toBeNull();
  });
  it('lists services, keywords and the area', () => {
    render(
      <ServicesAreaSummary
        profile={{ ...base, serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 16.1, zips: ['1', '2', '3'], towns: ['Granbury'] } }}
        serviceNames={{ ac_repair: 'AC repair' }}
      />,
    );
    for (const t of ['AC repair', 'ac repair', 'Linked']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText(/10 miles around the business/)).toBeTruthy();
    expect(screen.getByText(/3 ZIP codes/)).toBeTruthy();
    expect(screen.getByText(/Granbury/)).toBeTruthy();
  });
  it('area summary omits 0 ZIP codes', () => {
    render(<ServicesAreaSummary profile={{ ...base, serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 16.1, zips: [] } }} serviceNames={{}} />);
    expect(screen.queryByText(/ZIP/)).toBeNull();
  });
  it('says so when there is no service area', () => {
    render(<ServicesAreaSummary profile={{ ...base, placeId: null, serviceArea: null }} serviceNames={{}} />);
    expect(screen.getByText('No service area set yet.')).toBeTruthy();
    expect(screen.getByText('Not linked')).toBeTruthy();
  });
});
