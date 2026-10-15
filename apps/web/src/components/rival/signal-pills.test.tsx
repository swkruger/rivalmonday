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
const pill = (name: RegExp) => screen.getByLabelText(name);

beforeAll(() => {
  // Radix popper measures its content.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

describe('SignalPills', () => {
  it('not-checked pill has dotted style and "Not checked" tooltip', async () => {
    render(<SignalPills signals={NONE} mode="suggestion" />);
    const google = pill(/^Google Ads:/);
    expect(google.getAttribute('data-state')).toBe('unchecked');
    expect(google.className).toContain('border-dotted');
    expect(google.getAttribute('aria-label')).toBe('Google Ads: Not checked');
    fireEvent.focus(google);
    expect((await screen.findAllByText('Not checked')).length).toBeGreaterThan(0);
  });

  it('never reads null as zero', () => {
    render(<SignalPills signals={NONE} mode="suggestion" />);
    expect(screen.queryByText(/^0/)).toBeNull();
    expect(screen.queryByText(/Google Ads 0/)).toBeNull();
  });

  it('marks hot signals and checked-none ones, with the decided tooltip text', () => {
    const s: Signals = {
      ...NONE, rating: 4.6, votes: 120, reviews30d: 6, googleAdsActive: 6, googleAdsNew30d: 2, metaPage: 'matched', metaAdsActive: 3,
      presence: { searches: 18, appeared: 7, bestRank: 2 }, chain: true, categoryMatch: 'related',
    };
    render(<SignalPills signals={s} mode="suggestion" />);
    expect(pill(/^4.6 · 120:/).getAttribute('aria-label')).toContain('4.6 stars from 120 reviews');
    expect(pill(/reviews 30 d:/).getAttribute('data-state')).toBe('hot');
    expect(pill(/reviews 30 d:/).getAttribute('aria-label')).toContain('6 new reviews in the last 30 days');
    expect(pill(/^Google Ads 6:/).getAttribute('data-state')).toBe('hot');
    expect(pill(/^Google Ads 6:/).getAttribute('aria-label')).toContain('6 active Google ads, 2 started in the last 30 days');
    expect(pill(/^Meta page · 3 ads:/).getAttribute('data-state')).toBe('hot');
    expect(pill(/^Meta page · 3 ads:/).getAttribute('aria-label')).toContain('Meta page found, 3 active ads');
    expect(pill(/^in 7 of 18 searches:/).getAttribute('aria-label')).toContain('Appeared in 7 of 18 searches, best rank #2');
    expect(pill(/^Chain:/).getAttribute('aria-label')).toContain('Part of a chain or franchise');
    expect(pill(/^Different specialty:/)).toBeTruthy();
  });

  it('shows checked-none as grey with a strike, and a missing Meta page as none', () => {
    render(<SignalPills signals={{ ...NONE, reviews30d: 0, googleAdsActive: 0, googleAdsNew30d: 0, metaPage: 'none' }} mode="suggestion" />);
    expect(pill(/^0 reviews 30 d:/).className).toContain('line-through');
    expect(pill(/^Google Ads 0:/).getAttribute('data-state')).toBe('none');
    expect(pill(/^Meta:/).getAttribute('aria-label')).toBe('Meta: No Meta page found');
  });

  it('a possible Meta page is active, not hot, without active ads', () => {
    render(<SignalPills signals={{ ...NONE, metaPage: 'possible', metaAdsActive: 0 }} mode="suggestion" />);
    const m = pill(/^Meta page/);
    expect(m.getAttribute('data-state')).toBe('active');
    expect(m.getAttribute('aria-label')).toContain('Possible Meta page found');
  });

  it('tracked mode leaves out the search presence pill', () => {
    render(<SignalPills signals={{ ...NONE, presence: { searches: 18, appeared: 7, bestRank: 2 } }} mode="tracked" />);
    expect(screen.queryByLabelText(/searches/)).toBeNull();
  });
});

describe('TierChip', () => {
  it('uses the decided labels', () => {
    render(
      <>
        <TierChip tier="top" />
        <TierChip tier="watch" />
        <TierChip tier="minor" />
      </>,
    );
    expect(screen.getByText('Top rival').className).toContain('bg-ink');
    expect(screen.getByText('Worth watching')).toBeTruthy();
    expect(screen.getByText('Minor')).toBeTruthy();
  });
});
