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
