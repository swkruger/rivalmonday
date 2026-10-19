// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { projectToImage } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { GeoGrid, rankFill } from './geo-grid';

describe('GeoGrid fixes and map (Task 12)', () => {
  const cells = [[1, 4], [21, null]];
  const hatchIds = (c: HTMLElement) => [...c.querySelectorAll('pattern')].map((p) => p.id);

  it('two grids on one page use distinct hatch ids', () => {
    const { container } = render(<><GeoGrid title="A" summary="S" cells={cells} businessName="You" keyword="k" /><GeoGrid title="B" summary="S" cells={cells} businessName="You" keyword="k" /></>);
    const ids = hatchIds(container);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9_-]+$/));
    const fills = [...container.querySelectorAll('rect[fill^="url(#"]')].map((r) => r.getAttribute('fill')!.slice(5, -1));
    fills.forEach((f) => expect(ids).toContain(f));
  });

  it('legend emits one defs', () => {
    const { container } = render(<GeoGrid title="T" summary="S" cells={cells} businessName="You" keyword="k" />);
    expect(container.querySelectorAll('svg[data-legend-defs] defs').length).toBe(1);
    expect(container.querySelector('ul')!.querySelectorAll('defs').length).toBe(0);
    expect(container.querySelectorAll('ul svg use, ul svg rect[fill^="url(#"]').length).toBeGreaterThan(0);
  });

  it('a short row renders no-data cells', () => {
    render(<GeoGrid title="T" summary="S" cells={[[1, 2, 3], [4]]} businessName="You" keyword="k" />);
    const svg = screen.getByRole('img');
    expect([...svg.querySelectorAll('text[data-rank]')].map((n) => n.textContent)).toEqual(['1', '2', '3', '4', '–', '–']);
  });

  const map = { url: '/files/rank-map/c1?v=1', bounds: { west: -97.8, south: 30.2, east: -97.6, north: 30.4 }, width: 400, height: 400, attribution: '© OpenStreetMap contributors' };
  const lats = [30.35, 30.25];
  const lngs = [-97.75, -97.65];

  it('with a map the image and attribution render and cells sit at projected positions', () => {
    render(<GeoGrid title="T" summary="S" cells={cells} businessName="You" keyword="k" map={map} lats={lats} lngs={lngs} />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 400');
    const img = svg.querySelector('image')!;
    expect(img.getAttribute('href')).toBe(map.url);
    expect(img.getAttribute('preserveAspectRatio')).toBe('none');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('© OpenStreetMap contributors').closest('figcaption')).toBeTruthy();
    expect(svg.querySelectorAll('text[data-compass]').length).toBe(0);
    const p = projectToImage({ lat: lats[0]!, lng: lngs[0]! }, map.bounds, 400, 400);
    const rect = svg.querySelector('g rect')!;
    const x = Number(rect.getAttribute('x'));
    const w = Number(rect.getAttribute('width'));
    const y = Number(rect.getAttribute('y'));
    const h = Number(rect.getAttribute('height'));
    expect(x + w / 2).toBeCloseTo(p.x, 1);
    expect(y + h / 2).toBeCloseTo(p.y, 1);
    expect(w).toBeGreaterThanOrEqual(18);
  });

  it('with a 1024-wide map frame the rank labels scale with the cell size, not a fixed 13', () => {
    const big = { ...map, width: 1024, height: 1024 };
    render(<GeoGrid title="T" summary="S" cells={cells} businessName="You" keyword="k" map={big} lats={lats} lngs={lngs} />);
    const svg = screen.getByRole('img');
    const size = Number(svg.querySelector('g rect')!.getAttribute('width'));
    const label = svg.querySelector('text[data-rank]')!;
    const font = Number(label.getAttribute('font-size'));
    expect(size).toBeGreaterThan(100);
    expect(font).toBeGreaterThan(13);
    expect(font).toBeCloseTo(size * 0.35, 1);
    // Rendered at the chart's 520 px max width the label stays at least ~12 px.
    expect(font * (520 / 1024)).toBeGreaterThanOrEqual(12);
  });

  it('on a map cells are 60% of the smallest point spacing', () => {
    render(<GeoGrid title="T" summary="S" cells={cells} businessName="You" keyword="k" map={map} lats={lats} lngs={lngs} />);
    const p = (la: number, ln: number) => projectToImage({ lat: la, lng: ln }, map.bounds, 400, 400);
    const spacing = Math.min(Math.abs(p(lats[0]!, lngs[1]!).x - p(lats[0]!, lngs[0]!).x), Math.abs(p(lats[1]!, lngs[0]!).y - p(lats[0]!, lngs[0]!).y));
    expect(Number(screen.getByRole('img').querySelector('g rect')!.getAttribute('width'))).toBeCloseTo(0.6 * spacing, 1);
  });

  it('on a map ranked cells are 80% opaque, 20+ is 35% white with a faint outline, and labels get a halo', () => {
    render(<GeoGrid title="T" summary="S" cells={cells} businessName="You" keyword="k" map={map} lats={lats} lngs={lngs} />);
    const rects = [...screen.getByRole('img').querySelectorAll('g rect')];
    expect(rects[0]!.getAttribute('fill')).toBe('#0d366b');
    expect(rects[0]!.getAttribute('fill-opacity')).toBe('0.8');
    expect(rects[1]!.getAttribute('fill-opacity')).toBe('0.8');
    expect(rects[2]!.getAttribute('fill')).toBe('#FFFFFF');
    expect(rects[2]!.getAttribute('fill-opacity')).toBe('0.35');
    expect(rects[2]!.getAttribute('stroke')).toBe('rgba(11,37,64,0.25)');
    expect(rects[3]!.getAttribute('fill')).toMatch(/^url\(#/);
    const labels = [...screen.getByRole('img').querySelectorAll('text[data-rank]')];
    expect(labels[0]!.getAttribute('paint-order')).toBe('stroke');
    expect(labels[0]!.getAttribute('stroke')).toBe('rgba(11,37,64,0.35)');
    expect(labels[2]!.getAttribute('stroke')).toBe('rgba(255,255,255,0.7)');
  });

  it('on a map the grid sits inside the zoom controls and the legend shows 20+ as see-through white', () => {
    const { container } = render(<GeoGrid title="T" summary="S" cells={cells} businessName="You" keyword="k" map={map} lats={lats} lngs={lngs} />);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    const swatch = screen.getByText('Not in top 20').closest('li')!.querySelector('rect')!;
    expect(swatch!.getAttribute('fill')).toBe('#FFFFFF');
    expect(container.querySelector('[data-map-zoom] svg[role="img"]')).toBeTruthy();
  });

  it('without a map the plain grid renders', () => {
    const { container } = render(<GeoGrid title="T" summary="S" cells={cells} businessName="You" keyword="k" map={null} lats={lats} lngs={lngs} />);
    expect(container.querySelector('image')).toBeNull();
    expect(container.querySelector('figcaption')).toBeNull();
    expect(container.querySelectorAll('text[data-compass]').length).toBe(4);
    expect(container.querySelector('text[data-rank]')!.getAttribute('font-size')).toBe('13');
    const rect = container.querySelector('g rect')!;
    expect(rect!.getAttribute('width')).toBe('42');
    expect(rect.hasAttribute('fill-opacity')).toBe(false);
    expect(container.querySelector('text[data-rank]')!.hasAttribute('paint-order')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
  });
});

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
