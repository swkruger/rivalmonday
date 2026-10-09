// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sentimentFill, ThemeHeatmap } from './theme-heatmap';

const t = (themeId: string, share: number | null, sentiment: number | null, shareDelta: number | null = null) =>
  ({ themeId, mentions: 1, asked: 2, share, sentiment, shareDelta, sentimentDelta: null });

const benchmark = {
  themes: [{ id: 'response_time', name: 'Response time' }, { id: 'upsell_pressure', name: 'Upsell pressure' }],
  businesses: [
    { competitorId: 's', name: 'A1 HVAC', self: true, reviews: 4, avgRating: 4.5, prevReviews: 2, prevAvgRating: 4, themes: [t('response_time', 0.34, 0.6, 0.08), t('upsell_pressure', null, null)] },
    { competitorId: 'x', name: 'Smith HVAC', self: false, reviews: 3, avgRating: 3, prevReviews: 3, prevAvgRating: 3, themes: [t('response_time', 0.5, -1), t('upsell_pressure', 0.2, null)] },
  ],
};

describe('sentimentFill (decision 12)', () => {
  it('maps sentiment to the validated diverging steps with readable text', () => {
    expect(sentimentFill(-1, 0.5)).toEqual({ fill: '#d03b3b', text: '#FFFFFF', stroke: null });
    expect(sentimentFill(-0.3, 0.5)).toEqual({ fill: '#f19c99', text: '#0B2540', stroke: null });
    expect(sentimentFill(0, 0.5)).toEqual({ fill: '#f0efec', text: '#0B2540', stroke: '#E2E8F0' });
    expect(sentimentFill(0.3, 0.5)).toEqual({ fill: '#86b6ef', text: '#0B2540', stroke: null });
    expect(sentimentFill(0.5, 0.5)).toEqual({ fill: '#256abf', text: '#FFFFFF', stroke: null });
    expect(sentimentFill(null, 0.2)).toEqual({ fill: '#f0efec', text: '#0B2540', stroke: '#E2E8F0' });
    expect(sentimentFill(null, null)).toEqual({ fill: '#FFFFFF', text: '#64748B', stroke: '#E2E8F0' });
  });
});

describe('ThemeHeatmap', () => {
  it('prints the share in each cell, "—" when the theme was never asked, and an arrow for a big change', () => {
    render(<ThemeHeatmap title="What customers talk about" benchmark={benchmark} />);
    const svg = screen.getByRole('img', { name: /What customers talk about/ });
    const texts = [...svg.querySelectorAll('text[data-cell]')].map((n) => n.textContent);
    expect(texts).toEqual(['34% ▲', '50%', '—', '20%']);
    expect(svg.querySelector('[data-cell="response_time|x"]')!.closest('g')!.querySelector('rect')!.getAttribute('fill')).toBe('#d03b3b');
    expect([...svg.querySelectorAll('text[data-head]')].map((n) => n.textContent)).toEqual(['You', 'Smith HVAC']); // self column first
  });

  it('has a legend and a table view with a caption', () => {
    render(<ThemeHeatmap title="What customers talk about" benchmark={benchmark} />);
    expect(screen.getByText('Very negative')).toBeTruthy();
    expect(screen.getByText('Very positive')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')!.textContent).toBe('What customers talk about');
    expect(screen.getByRole('rowheader', { name: 'Response time' })).toBeTruthy();
  });

  it('says so when there is nothing to show', () => {
    render(<ThemeHeatmap title="T" benchmark={{ themes: [], businesses: [] }} />);
    expect(screen.getByText('No reviews analysed yet.')).toBeTruthy();
  });
});
