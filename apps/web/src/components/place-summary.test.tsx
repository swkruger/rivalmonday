// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DuplicateHint, formatPhone, PlaceSummary } from './place-summary';

const place = {
  placeId: 'p1', cid: 'c1', title: 'Smith Dental', address: '1 Main St, Austin, TX', city: 'Austin', category: 'Dentist',
  phone: '(512) 555-0100', domain: 'smithdental.com', rating: 4.6, votes: 1234, lat: 30, lng: -97,
};

describe('PlaceSummary', () => {
  it('shows title, phone, domain, category, rating and reviews', () => {
    render(<PlaceSummary place={place} isClaimed={null} possibleDuplicate={false} />);
    expect(screen.getByText('Smith Dental')).toBeTruthy();
    expect(screen.getByText('(512) 555-0100 · smithdental.com')).toBeTruthy();
    expect(screen.getByText('Dentist · 4.6 ★ 1,234 reviews')).toBeTruthy();
    expect(screen.getByText('1 Main St, Austin, TX')).toBeTruthy();
  });
  it('shows Owner-verified only when isClaimed is true', () => {
    const { rerender } = render(<PlaceSummary place={place} isClaimed={true} possibleDuplicate={false} />);
    expect(screen.queryByText('Owner-verified')).toBeTruthy();
    rerender(<PlaceSummary place={place} isClaimed={null} possibleDuplicate={false} />);
    expect(screen.queryByText('Owner-verified')).toBeNull();
    rerender(<PlaceSummary place={place} isClaimed={false} possibleDuplicate={false} />);
    expect(screen.queryByText('Owner-verified')).toBeNull();
  });
  it('null address shows the service-area line', () => {
    render(<PlaceSummary place={{ ...place, address: null }} isClaimed={null} possibleDuplicate={false} />);
    expect(screen.getByText('Address hidden — service-area business')).toBeTruthy();
  });
  it('flags a possible duplicate listing', () => {
    const { rerender } = render(<PlaceSummary place={place} isClaimed={null} possibleDuplicate={false} />);
    expect(screen.queryByText('Possible duplicate listing')).toBeNull();
    rerender(<PlaceSummary place={place} isClaimed={null} possibleDuplicate={true} />);
    expect(screen.getByText('Possible duplicate listing')).toBeTruthy();
  });
  it('omits missing details cleanly', () => {
    render(<PlaceSummary place={{ ...place, phone: null, domain: null, category: null, rating: null, votes: null }} isClaimed={null} possibleDuplicate={false} />);
    expect(screen.queryByText(/·/)).toBeNull();
  });
});

describe('formatPhone', () => {
  it('formats US numbers as (817) 286-3655: 10 digits, or 11 with a leading 1', () => {
    expect(formatPhone('+1817-286-3655')).toBe('(817) 286-3655');
    expect(formatPhone('817.286.3655')).toBe('(817) 286-3655');
    expect(formatPhone('18172863655')).toBe('(817) 286-3655');
  });
  it('leaves anything else raw', () => {
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(formatPhone('+3312345678')).toBe('+3312345678');
    expect(formatPhone('555-0100')).toBe('555-0100');
    expect(formatPhone('28172863655')).toBe('28172863655');
  });
  it('PlaceSummary shows the formatted number', () => {
    render(<PlaceSummary place={{ ...place, phone: '+1512-555-0100' }} isClaimed={null} possibleDuplicate={false} />);
    expect(screen.getByText('(512) 555-0100 · smithdental.com')).toBeTruthy();
  });
});

describe('DuplicateHint', () => {
  it('explains the duplicate flag', () => {
    render(<DuplicateHint />);
    expect(screen.getByText("Google shows more than one listing with the same phone number or website. Pick the owner-verified one if it's there.")).toBeTruthy();
  });
});
