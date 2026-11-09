// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdCard } from './ad-card';

const base = {
  id: 'a', competitorId: 'x', competitorName: 'Smith HVAC', platform: 'meta' as const, format: 'image', title: '$49 tune-up', text: 'Book now',
  landingUrl: 'https://smithhvac.example/tuneup?utm=1', firstSeenAt: '2026-09-12T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z',
  endedAt: null, active: true, libraryUrl: 'https://www.facebook.com/ads/library/?id=m1',
  imageEvidenceIds: [] as string[],
};

describe('AdCard', () => {
  it('shows the creative text, dates, the targeting note and the library link (decision 5)', () => {
    render(<AdCard clientId="c1" ad={base} timezone="UTC" />);
    expect(screen.getByRole('heading', { name: '$49 tune-up' })).toBeTruthy();
    expect(screen.getByText('Book now')).toBeTruthy();
    expect(screen.getByText('smithhvac.example/tuneup?utm=1')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText(/First seen Sep 12 · last seen Oct 6/)).toBeTruthy();
    expect(screen.getByText('Targeting not disclosed (US)')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'View in Meta Ad Library' });
    expect([link.getAttribute('href'), link.getAttribute('rel')]).toEqual([base.libraryUrl, 'noopener noreferrer']);
  });

  it('is a static Frame: no shadow', () => {
    render(<AdCard clientId="c1" ad={base} timezone="UTC" />);
    expect(screen.getByRole('article').className).not.toContain('shadow');
  });

  it('ad card dates in the client zone, "Active" chip', () => {
    render(<AdCard clientId="c1" ad={{ ...base, firstSeenAt: '2026-09-12T02:00:00.000Z' }} timezone="America/Chicago" />);
    expect(screen.getByText(/First seen Sep 11/)).toBeTruthy();
    expect(screen.getByText('Active').className).toContain('bg-chip-success-bg');
  });

  it('marks an ended Google ad and has no link without a library url', () => {
    render(<AdCard clientId="c1" ad={{ ...base, platform: 'google', active: false, endedAt: '2026-09-30T00:00:00.000Z', libraryUrl: null }} timezone="UTC" />);
    expect(screen.getByText('Ended')).toBeTruthy();
    expect(screen.getByText(/ended Sep 30/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('AdCard images', () => {
  it('shows the stored image with alt and lazy loading when an id exists, text card otherwise, never a vendor URL', () => {
    const { container, rerender } = render(<AdCard clientId="c1" ad={{ ...base, imageEvidenceIds: ['e1', 'e0'] }} timezone="UTC" />);
    const img = screen.getByRole('img', { name: 'Ad image from Smith HVAC' });
    expect([img.getAttribute('src'), img.getAttribute('loading')]).toEqual(['/files/evidence/c1/e1', 'lazy']);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.innerHTML).not.toMatch(/src="https?:/);
    rerender(<AdCard clientId="c1" ad={base} timezone="UTC" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('heading', { name: '$49 tune-up' })).toBeTruthy();
  });
});
