// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChangeGrid, changeFill } from './change-grid';

describe('changeFill', () => {
  it('changeFill maps +4 to mid blue, −7 to dark orange, 0 to neutral, null to hatch', () => {
    expect(changeFill(4)).toEqual({ fill: '#47a8e7', text: '#0B2540', label: '+4' });
    expect(changeFill(-7)).toEqual({ fill: '#9a4f00', text: '#FFFFFF', label: '−7' });
    expect(changeFill(0)).toEqual({ fill: '#f0efec', text: '#0B2540', label: '=' });
    expect(changeFill(null).fill).toMatch(/^url\(#[A-Za-z0-9_-]+\)$/);
    expect(changeFill(null).label).toBe('–');
  });

  it('switches step at 2/3 and 5/6 on both sides', () => {
    expect(changeFill(1).fill).toBe('#86b6ef');
    expect(changeFill(2).fill).toBe('#86b6ef');
    expect(changeFill(3).fill).toBe('#47a8e7');
    expect(changeFill(5).fill).toBe('#47a8e7');
    expect(changeFill(6).fill).toBe('#2a6bac');
    expect(changeFill(-2).fill).toBe('#f0a22e');
    expect(changeFill(-3).fill).toBe('#d47a06');
    expect(changeFill(-6).fill).toBe('#9a4f00');
  });
});

describe('ChangeGrid', () => {
  it('ChangeGrid prints signed labels', () => {
    // Change = rank before − rank after: 7 → 3 is +4 (moved up); 2 → 9 is −7; null on either side is no data.
    render(<ChangeGrid before={[[7, 2], [5, null]]} after={[[3, 9], [5, 4]]} lats={[30.3, 30.2]} lngs={[-97.8, -97.7]} />);
    const svg = screen.getByRole('img');
    expect([...svg.querySelectorAll('text[data-change]')].map((n) => n.textContent)).toEqual(['+4', '−7', '=', '–']);
    for (const l of ['Moved up', 'Same', 'Moved down', 'No data']) expect(screen.getByText(l)).toBeTruthy();
    const ids = [...document.querySelectorAll('pattern')].map((p) => p.id);
    [...svg.querySelectorAll('rect[fill^="url(#"]')].forEach((r) => expect(ids).toContain(r.getAttribute('fill')!.slice(5, -1)));
  });

  it('draws on the map when one is given', () => {
    const map = { url: '/files/rank-map/c1?v=1', bounds: { west: -97.85, south: 30.15, east: -97.65, north: 30.35 }, width: 400, height: 400, attribution: '© OpenStreetMap contributors' };
    render(<ChangeGrid before={[[1, 2], [3, 4]]} after={[[1, 2], [3, 4]]} lats={[30.3, 30.2]} lngs={[-97.8, -97.7]} map={map} />);
    expect(screen.getByRole('img').querySelector('image')!.getAttribute('href')).toBe(map.url);
    expect(screen.getByText('© OpenStreetMap contributors')).toBeTruthy();
  });
});
