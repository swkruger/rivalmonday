// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GeoGrid, rankFill } from './geo-grid';

describe('rankFill (decision 12)', () => {
  it('uses the validated single-hue ramp, darker for better ranks', () => {
    expect(rankFill(1)).toEqual({ fill: '#0d366b', text: '#FFFFFF', label: '1', stroke: null });
    expect(rankFill(3)).toMatchObject({ fill: '#0d366b' });
    expect(rankFill(4)).toEqual({ fill: '#256abf', text: '#FFFFFF', label: '4', stroke: null });
    expect(rankFill(11)).toEqual({ fill: '#86b6ef', text: '#0B2540', label: '11', stroke: null });
    expect(rankFill(21)).toEqual({ fill: '#f0efec', text: '#0B2540', label: '20+', stroke: '#E2E8F0' });
    expect(rankFill(null)).toEqual({ fill: 'url(#geogrid-hatch)', text: '#64748B', label: '–', stroke: '#E2E8F0' });
  });

  it('switches band exactly at 3/4, 10/11 and 20/21', () => {
    expect(rankFill(3).fill).toBe('#0d366b');
    expect(rankFill(4).fill).toBe('#256abf');
    expect(rankFill(10).fill).toBe('#256abf');
    expect(rankFill(11).fill).toBe('#86b6ef');
    expect(rankFill(20)).toMatchObject({ fill: '#86b6ef', label: '20', stroke: null });
    expect(rankFill(21)).toMatchObject({ fill: '#f0efec', label: '20+' });
  });
});

describe('GeoGrid', () => {
  const cells = [[1, 4], [21, null]];

  it('draws one labelled cell per point, rows north to south, with compass labels', () => {
    render(<GeoGrid title="Local rankings for ac repair" summary="Top 3 at 1 of 3 points · average rank 8.7" cells={cells} businessName="You" keyword="ac repair" />);
    const svg = screen.getByRole('img', { name: 'Local rankings for ac repair. Top 3 at 1 of 3 points · average rank 8.7' });
    expect([...svg.querySelectorAll('text[data-rank]')].map((n) => n.textContent)).toEqual(['1', '4', '20+', '–']);
    expect([...svg.querySelectorAll('text[data-compass]')].map((n) => n.textContent)).toEqual(['N', 'S', 'W', 'E']);
    const titles = [...svg.querySelectorAll('g > title')].map((n) => n.textContent);
    expect(titles).toContain('You: not in the top 20 for "ac repair" (row 2 of 2, column 1 of 2)');
    expect(titles).toContain('You: no data for this point for "ac repair" (row 2 of 2, column 2 of 2)');
  });

  it('has a legend and a table view', () => {
    render(<GeoGrid title="T" summary="S" cells={cells} businessName="You" keyword="k" />);
    expect(screen.getByText('Not in top 20')).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')!.textContent).toBe('T');
    expect(screen.getByRole('rowheader', { name: 'Row 1 (north)' })).toBeTruthy();
  });

  it('says so with no cells', () => {
    render(<GeoGrid title="T" summary="S" cells={[]} businessName="You" keyword="k" />);
    expect(screen.getByText('No rank data in this scan.')).toBeTruthy();
  });
});
