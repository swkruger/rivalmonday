// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProspectLandscape } from './prospect-landscape';

const data = {
  generatedAt: '2026-10-07T12:00:00.000Z', keywords: ['dentist'], points: 9, scanId: null, notes: ['Bright Smiles: Meta ads unavailable from the data provider'],
  businesses: [
    { competitorId: 'a', name: 'Peach Dental', self: true, gbp: { rating: 4.9, reviews: 31, category: 'Dentist', extraCategories: 0 }, ads: { google: null, meta: null }, ranks: [{ keyword: 'dentist', found: 3, top3: 3, averageRank: 1 }] },
    { competitorId: 'b', name: 'Bright Smiles', self: false, gbp: null, ads: { google: 2, meta: null }, ranks: [{ keyword: 'dentist', found: 5, top3: 2, averageRank: 3.4 }] },
  ],
};

describe('ProspectLandscape', () => {
  it('shows profiles, ads and map visibility, marks the prospect, and lists notes', () => {
    render(<ProspectLandscape data={data} />);
    const profile = within(screen.getByRole('table', { name: 'Google profile and ads' }));
    expect(profile.getByText('Peach Dental')).toBeTruthy();
    expect(profile.getByText('(prospect)')).toBeTruthy();
    expect(profile.getByText('4.9')).toBeTruthy();
    expect(profile.getAllByText('not checked').length).toBeGreaterThan(0);
    const ranks = within(screen.getByRole('table', { name: 'Map visibility' }));
    expect(ranks.getByText('5/9 · top 3: 2 · avg 3.4')).toBeTruthy();
    expect(screen.getByText(/Meta ads unavailable/)).toBeTruthy();
  });
});
