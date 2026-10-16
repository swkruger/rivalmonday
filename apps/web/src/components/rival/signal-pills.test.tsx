// @vitest-environment jsdom
import type { SuggestionView } from '@cs/tools';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SignalPills } from './signal-pills';
import { TierChip } from './tier-chip';

type Signals = SuggestionView['signals'];
const NONE: Signals = {
  rating: null, votes: null, reviews30d: null, reviews90d: null, replyRate: null, googleAdsActive: null, googleAdsNew30d: null, googleAccount: null,
  metaPage: null, metaAdsActive: null, claimed: null, chain: null, categoryMatch: null, distanceKm: null, presence: null,
};
const pill = (name: RegExp) => screen.getByRole('img', { name });

beforeAll(() => {
  // Radix popper measures its content.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

describe('SignalPills', () => {
  it('not-checked pill has a dashed outline, "· not checked" text and a "Not checked" tooltip', async () => {
    render(<SignalPills signals={NONE} mode="suggestion" />);
    const google = pill(/^Google ads · not checked\./);
    expect(google.getAttribute('data-state')).toBe('unchecked');
    expect(google.className).toContain('border-dashed');
    expect(google.className).toContain('text-muted-ink');
    expect(google.getAttribute('aria-label')).toBe('Google ads · not checked. Not checked');
    expect(pill(/^Meta · not checked\./)).toBeTruthy();
    expect(pill(/^Reviews · not checked\./)).toBeTruthy();
    fireEvent.focus(google);
    expect((await screen.findAllByText('Not checked')).length).toBeGreaterThan(0);
  });

  it('never reads null as zero', () => {
    render(<SignalPills signals={NONE} mode="suggestion" />);
    expect(screen.queryByText(/^0/)).toBeNull();
    expect(screen.queryByText(/No Google ads|No Meta ads|No new reviews/)).toBeNull();
  });

  it('info pills are soft blue; hot pills are soft amber with an aria-hidden arrow and "new activity" in the name', () => {
    const s: Signals = {
      ...NONE, rating: 4.6, votes: 120, reviews30d: 6, googleAdsActive: 6, googleAdsNew30d: 2, metaPage: 'matched', metaAdsActive: 3,
      presence: { searches: 18, appeared: 7, bestRank: 2 }, chain: true, categoryMatch: 'related',
    };
    render(<SignalPills signals={s} mode="suggestion" />);
    const rating = pill(/^4.6 · 120\./);
    expect(rating.getAttribute('aria-label')).toContain('4.6 stars from 120 reviews');
    expect(rating.className).toContain('bg-primary-soft');
    expect(rating.className).toContain('text-primary-soft-text');
    const reviews = pill(/^6 reviews · 30 d\./);
    expect(reviews.getAttribute('data-state')).toBe('hot');
    expect(reviews.className).toContain('bg-[#FFF3DC]');
    expect(reviews.className).toContain('text-[#B45309]');
    expect(reviews.getAttribute('aria-label')).toContain('6 new reviews in the last 30 days · new activity');
    const arrow = reviews.querySelector('[aria-hidden="true"]');
    expect(arrow?.textContent).toBe('↑');
    expect(pill(/^Google ads · 6\./).getAttribute('data-state')).toBe('hot');
    expect(pill(/^Google ads · 6\./).getAttribute('aria-label')).toContain('6 active Google ads, 2 started in the last 30 days');
    expect(pill(/^Meta · 3 ads\./).getAttribute('data-state')).toBe('hot');
    expect(pill(/^Meta · 3 ads\./).getAttribute('aria-label')).toContain('Meta page found, 3 active ads');
    expect(pill(/^7 of 18 searches\./).getAttribute('aria-label')).toContain('Appeared in 7 of 18 searches, best rank #2');
    expect(pill(/^Chain\./).getAttribute('aria-label')).toContain('Part of a chain or franchise');
    expect(pill(/^Different specialty\./)).toBeTruthy();
  });

  it('shows checked-none as plain grey wording, without background or strike', () => {
    render(<SignalPills signals={{ ...NONE, reviews30d: 0, googleAdsActive: 0, googleAdsNew30d: 0, metaPage: 'none' }} mode="suggestion" />);
    for (const name of [/^No new reviews\./, /^No Google ads\./, /^No Meta ads\./]) {
      const p = pill(name);
      expect(p.getAttribute('data-state')).toBe('none');
      expect(p.className).toContain('text-muted-ink');
      expect(p.className).not.toMatch(/line-through|bg-/);
    }
    expect(pill(/^No Meta ads\./).getAttribute('aria-label')).toBe('No Meta ads. No active Meta ads found');
  });

  it('a possible Meta page is active, not hot, without active ads', () => {
    render(<SignalPills signals={{ ...NONE, metaPage: 'possible', metaAdsActive: 0 }} mode="suggestion" />);
    const m = pill(/^Meta page\./);
    expect(m.getAttribute('data-state')).toBe('active');
    expect(m.getAttribute('aria-label')).toContain('Possible Meta page found');
  });

  it('a few new reviews and running Google ads without new ones are info, not hot', () => {
    render(<SignalPills signals={{ ...NONE, reviews30d: 1, googleAdsActive: 2, googleAdsNew30d: 0 }} mode="tracked" />);
    expect(pill(/^1 review · 30 d\./).getAttribute('data-state')).toBe('active');
    expect(pill(/^Google ads · 2\./).getAttribute('data-state')).toBe('active');
  });

  it('tracked mode leaves out the search presence pill', () => {
    render(<SignalPills signals={{ ...NONE, presence: { searches: 18, appeared: 7, bestRank: 2 } }} mode="tracked" />);
    expect(screen.queryByRole('img', { name: /searches/ })).toBeNull();
  });
});

describe('TierChip', () => {
  it('uses the decided labels as small soft pills', () => {
    render(
      <>
        <TierChip tier="top" />
        <TierChip tier="watch" />
        <TierChip tier="minor" />
      </>,
    );
    expect(screen.getByText('Top rival').className).toContain('bg-[#E2E8F0]');
    expect(screen.getByText('Top rival').className).toContain('text-ink');
    expect(screen.getByText('Worth watching').className).toContain('bg-primary-soft');
    expect(screen.getByText('Minor').className).toContain('text-[#4A5D73]');
  });
});
