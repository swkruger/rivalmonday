// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sentimentFill, TopicHeatmap } from './topic-heatmap';

const t = (topicId: string, share: number | null, sentiment: number | null, shareDelta: number | null = null) =>
  ({ topicId, mentions: 1, asked: 2, share, sentiment, shareDelta, sentimentDelta: null });

const benchmark = {
  topics: [{ id: 'response_time', name: 'Response time' }, { id: 'upsell_pressure', name: 'Upsell pressure' }],
  businesses: [
    { competitorId: 's', name: 'A1 HVAC', self: true, reviews: 4, avgRating: 4.5, prevReviews: 2, prevAvgRating: 4, topics: [t('response_time', 0.34, 0.3, 0.08), t('upsell_pressure', null, null)] },
    { competitorId: 'x', name: 'Smith HVAC', self: false, reviews: 3, avgRating: 3, prevReviews: 3, prevAvgRating: 3, topics: [t('response_time', 0.5, -1), t('upsell_pressure', 0.2, null)] },
  ],
};

describe('sentimentFill (decision 12)', () => {
  it('maps sentiment to the validated diverging steps with readable text', () => {
    expect(sentimentFill(-1, 0.5)).toEqual({ fill: '#d03b3b', text: 'var(--surface)', stroke: null });
    expect(sentimentFill(-0.3, 0.5)).toEqual({ fill: '#f19c99', text: 'var(--ink)', stroke: null });
    expect(sentimentFill(0, 0.5)).toEqual({ fill: '#f0efec', text: 'var(--ink)', stroke: 'var(--chart-grid)' });
    expect(sentimentFill(0.3, 0.5)).toEqual({ fill: '#86b6ef', text: 'var(--ink)', stroke: null });
    expect(sentimentFill(0.5, 0.5)).toEqual({ fill: '#256abf', text: 'var(--surface)', stroke: null });
    expect(sentimentFill(null, 0.2)).toEqual({ fill: '#f0efec', text: 'var(--ink)', stroke: 'var(--chart-grid)' });
    expect(sentimentFill(null, null)).toEqual({ fill: 'var(--surface)', text: 'var(--chart-axis)', stroke: 'var(--chart-grid)' });
  });
});

describe('TopicHeatmap', () => {
  it('prints the share in each cell, "—" when the topic was never asked, and an arrow for a big change', () => {
    render(<TopicHeatmap title="What customers talk about" benchmark={benchmark} />);
    const svg = screen.getByRole('img', { name: /What customers talk about/ });
    const texts = [...svg.querySelectorAll('text[data-cell]')].map((n) => n.textContent);
    expect(texts).toEqual(['34% ▲', '50%', '—', '20%']);
    expect(svg.querySelector('[data-cell="response_time|x"]')!.closest('g')!.querySelector('rect')!.getAttribute('fill')).toBe('#d03b3b');
    expect([...svg.querySelectorAll('text[data-head]')].map((n) => n.textContent)).toEqual(['You', 'Smith HVAC']); // self column first
  });

  it('has a legend and a table view with a caption', () => {
    render(<TopicHeatmap title="What customers talk about" benchmark={benchmark} />);
    expect(screen.getByText('Very negative')).toBeTruthy();
    expect(screen.getByText('Very positive')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')!.textContent).toBe('What customers talk about');
    expect(screen.getByRole('rowheader', { name: 'Response time' })).toBeTruthy();
  });

  it('explains the cell colour, the number and the 5-point arrows in a legend', () => {
    render(<TopicHeatmap title="What customers talk about" benchmark={benchmark} />);
    const legend = screen.getByTestId('heatmap-legend');
    expect(legend.textContent).toContain('Color shows how positive the mentions are');
    expect(legend.textContent).toContain('share of reviews checked for the topic that mention it');
    expect(legend.textContent).toContain('▲▼ the share moved by 5 or more points');
    expect(legend.textContent).toContain('previous 90 days');
    expect(legend.textContent).not.toMatch(/theme/i);
  });

  it('table cell reads "34% · Positive · ▲ 8 pts"', () => {
    render(<TopicHeatmap title="T" benchmark={benchmark} />);
    const row = screen.getByRole('rowheader', { name: 'Response time' }).closest('tr')!;
    const cells = [...row.querySelectorAll('td')].map((n) => n.textContent);
    expect(cells).toEqual(['34% · Positive · ▲ 8 pts', '50% · Very negative']);
    expect(screen.getByRole('columnheader', { name: 'You' }).className).toContain('text-you');
  });

  it('table cell with no data reads "—"', () => {
    render(<TopicHeatmap title="T" benchmark={benchmark} />);
    const row = screen.getByRole('rowheader', { name: 'Upsell pressure' }).closest('tr')!;
    expect([...row.querySelectorAll('td')].map((n) => n.textContent)).toEqual(['—', '20% · No sentiment']);
  });

  it('table and chart agree for every cell', () => {
    const { container } = render(<TopicHeatmap title="T" benchmark={benchmark} />);
    for (const tp of benchmark.topics) {
      const tr = screen.getByRole('rowheader', { name: tp.name }).closest('tr')!;
      benchmark.businesses.forEach((b, j) => {
        const td = tr.querySelectorAll('td')[j]!.textContent!;
        const title = container.querySelector(`[data-cell="${tp.id}|${b.competitorId}"]`)!.closest('g')!.querySelector('rect title')!.textContent!;
        expect(title).toContain(td);
      });
    }
  });

  it('svg keeps its natural width (minWidth)', () => {
    render(<TopicHeatmap title="T" benchmark={benchmark} />);
    expect(screen.getByRole('img').getAttribute('style')).toContain('min-width: 456px');
  });

  const withNames = (...names: string[]) => ({
    topics: benchmark.topics,
    businesses: names.map((name, i) => ({ ...benchmark.businesses[1]!, competitorId: `c${i}`, name })),
  });
  const headLines = (container: HTMLElement) => [...container.querySelectorAll('text[data-head]')].map((h) => [...h.querySelectorAll('tspan')].map((l) => l.textContent));

  it('wraps a long business name onto two lines instead of cutting it', () => {
    const { container } = render(<TopicHeatmap title="T" benchmark={withNames('Cleburne Rooter & Plumbing', 'Smith HVAC')} />);
    expect(headLines(container)).toEqual([['Cleburne Rooter &', 'Plumbing'], ['Smith HVAC']]);
  });

  it('cuts only what does not fit on two lines, and keeps the full name in the tooltip', () => {
    const name = 'Stockton Bend Water Heater and Drain Specialists Inc';
    const { container } = render(<TopicHeatmap title="T" benchmark={withNames(name)} />);
    const [[first, second]] = headLines(container) as [[string, string]];
    expect(first).toBe('Stockton Bend');
    expect(second!.endsWith('…')).toBe(true);
    expect(second!.length).toBeLessThanOrEqual(22);
    expect(container.querySelector('text[data-head]')!.closest('g')!.querySelector('title')!.textContent).toBe(name);
  });

  it('gives all-caps names less room per line, since capitals are wider', () => {
    const { container } = render(<TopicHeatmap title="T" benchmark={withNames('ACME ROOTER PLUMBING SERVICES')} />);
    const [lines] = headLines(container) as [string[]];
    expect(lines[0]).toBe('ACME ROOTER');
    expect(lines[1]!.endsWith('…')).toBe(true);
    expect(lines[1]!.length).toBeLessThanOrEqual(14);
  });

  it('cuts one very long word to the line width', () => {
    const { container } = render(<TopicHeatmap title="T" benchmark={withNames('Supercalifragilisticexpialidocious')} />);
    const [[first, second]] = headLines(container) as [[string, string?]];
    expect(first!.endsWith('…')).toBe(true);
    expect(first!.length).toBeLessThanOrEqual(22);
    expect(second).toBeUndefined();
  });

  it('keeps the coloured cells 102 x 32, centred in their wider columns', () => {
    const { container } = render(<TopicHeatmap title="T" benchmark={benchmark} />);
    const rects = [...container.querySelectorAll('svg rect')];
    expect(rects.length).toBe(4);
    for (const r of rects) {
      expect(r.getAttribute('width')).toBe('102');
      expect(r.getAttribute('height')).toBe('32');
    }
    const cx = (r: Element) => Number(r.getAttribute('x')) + 51;
    expect(cx(rects[0]!)).toBe(Number(container.querySelector('[data-cell="response_time|s"]')!.getAttribute('x')));
  });

  it('says so when there is nothing to show', () => {
    render(<TopicHeatmap title="T" benchmark={{ topics: [], businesses: [] }} />);
    expect(screen.getByText('No reviews analysed yet.')).toBeTruthy();
  });
});
