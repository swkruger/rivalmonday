/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PRINT_ROLE_HEX, PrintLineChart } from './print-line-chart';

const labels = ['W1', 'W2', 'W3'];
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('PrintLineChart', () => {
  it('print chart has role img and aria-label', () => {
    const out = html(<PrintLineChart title="Rating" labels={labels} series={[{ key: 'me', name: 'Acme', you: true, points: [4, 4.2, 4.5] }, { key: 'a', name: 'Rival', points: [3, 3, 3.5] }]} />);
    expect(out).toContain('role="img"');
    expect(out).toMatch(/aria-label="Rating[^"]*Acme 4\.5[^"]*Rival 3\.5/);
  });

  it('uses role hexes', () => {
    const out = html(<PrintLineChart title="T" labels={labels} series={[{ key: 'me', name: 'Acme', you: true, points: [1, 2, 3] }, { key: 'a', name: 'A', points: [1, 1, 1] }, { key: 'b', name: 'B', points: [2, 2, 2] }, { key: 'other', name: 'Other', points: [3, 3, 3] }]} />);
    for (const hex of Object.values(PRINT_ROLE_HEX)) expect(out).toContain(hex);
    expect(out).toContain('(you)');
    const svg = out.slice(0, out.indexOf('</svg>'));
    expect(svg.lastIndexOf(`stroke="${PRINT_ROLE_HEX.you}"`)).toBeGreaterThan(svg.lastIndexOf(`stroke="${PRINT_ROLE_HEX.context}"`));
  });

  it('a fixed y domain puts ticks from its floor to its top (ratings)', () => {
    const out = html(<PrintLineChart title="R" labels={labels} series={[{ key: 'me', name: 'Acme', you: true, points: [3.9, 4.4, 4.8] }]} yDomain={[3, 5]} yStep={0.5} yFormat={(v) => v.toFixed(1)} />);
    const ticks = [...out.matchAll(/text-anchor="end"[^>]*>([\d.]+)</g)].map((m) => Number(m[1]));
    expect(Math.max(...ticks)).toBe(5);
    expect(Math.min(...ticks)).toBeGreaterThan(0);
    expect(ticks).toHaveLength(5);
    const nulls = html(<PrintLineChart title="R" labels={labels} series={[{ key: 'a', name: 'Rival', points: [null, null, null] }]} yDomain={[3, 5]} yStep={0.5} />);
    expect(nulls).not.toContain('NaN');
  });

  it('renders no NaN for all-null series', () => {
    const out = html(<PrintLineChart title="T" labels={labels} series={[{ key: 'a', name: 'Rival', points: [null, null, null] }]} />);
    expect(out).not.toContain('NaN');
    expect(out).toContain('no data yet');
  });

  it('has no script or external refs', () => {
    const out = html(<PrintLineChart title="T" labels={labels} series={[{ key: 'a', name: 'A', points: [1, null, 3] }]} />);
    expect(out).not.toMatch(/<script|href=|src=|http/);
  });
});
