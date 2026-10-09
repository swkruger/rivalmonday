// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdCard } from './ad-card';

const base = {
  id: 'a', competitorId: 'x', competitorName: 'Smith HVAC', platform: 'meta' as const, format: 'image', title: '$49 tune-up', text: 'Book now',
  landingUrl: 'https://smithhvac.example/tuneup?utm=1', firstSeenAt: '2026-09-12T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z',
  endedAt: null, active: true, libraryUrl: 'https://www.facebook.com/ads/library/?id=m1',
};

describe('AdCard', () => {
  it('shows the creative text, dates, the targeting note and the library link (decision 5)', () => {
    render(<AdCard ad={base} />);
    expect(screen.getByRole('heading', { name: '$49 tune-up' })).toBeTruthy();
    expect(screen.getByText('Book now')).toBeTruthy();
    expect(screen.getByText('smithhvac.example/tuneup?utm=1')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText(/First seen Sep 12 · last seen Oct 6/)).toBeTruthy();
    expect(screen.getByText('Targeting not disclosed (US)')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'View in Meta Ad Library' });
    expect([link.getAttribute('href'), link.getAttribute('rel')]).toEqual([base.libraryUrl, 'noopener noreferrer']);
  });

  it('marks an ended Google ad and has no link without a library url', () => {
    render(<AdCard ad={{ ...base, platform: 'google', active: false, endedAt: '2026-09-30T00:00:00.000Z', libraryUrl: null }} />);
    expect(screen.getByText('Ended')).toBeTruthy();
    expect(screen.getByText(/ended Sep 30/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
