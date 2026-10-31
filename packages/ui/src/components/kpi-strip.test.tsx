// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Kpi, kpiTraceRuns, KpiStrip } from './kpi-strip';

afterEach(cleanup);

describe('KpiStrip naming', () => {
  it('is a named group only when labelled', () => {
    render(<KpiStrip aria-label="This week"><Kpi label="A" value="1" /></KpiStrip>);
    expect(screen.getByRole('group', { name: 'This week' })).toBeTruthy();
    cleanup();
    render(<KpiStrip><Kpi label="A" value="1" /></KpiStrip>);
    expect(screen.queryByRole('group')).toBeNull();
  });
});

describe('Kpi badge and caption', () => {
  it('renders the badge after the value and the caption last', () => {
    const { container } = render(
      <KpiStrip>
        <Kpi label="Alerts" value="5" badge={<b data-testid="b">3 high</b>} caption="this week" delta={{ value: 1, goodWhen: 'up', comparison: 'x' }} />
      </KpiStrip>,
    );
    const cell = container.querySelector('[data-slot=kpi]')!;
    const text = cell.textContent!;
    expect(text.indexOf('5')).toBeLessThan(text.indexOf('3 high'));
    expect(cell.lastElementChild?.textContent).toBe('this week');
    expect(screen.getByTestId('b').previousElementSibling?.textContent).toBe('5');
  });
  it('renders neither slot when absent', () => {
    const { container } = render(<Kpi label="A" value="1" />);
    expect(container.querySelector('[data-slot=kpi]')!.children).toHaveLength(2);
  });
});

describe('Kpi trace', () => {
  it('draws real points behind the figure, hidden from assistive tech', () => {
    const { container } = render(<Kpi label="A" value="1" trace={[1, 2, 3]} traceLabel="Last 3 weeks" />);
    const cell = container.querySelector('[data-slot=kpi]')!;
    expect(cell.getAttribute('title')).toBe('Last 3 weeks');
    expect(cell.querySelector('[data-slot=kpi-trace]')!.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('1')).toBeTruthy();
  });
  it('draws nothing with no two neighbouring known points or only zeros, and never invents one', () => {
    for (const trace of [[], [5], [null, 5, null], [0, 0, 0], [4, null, 5, null, 4]]) {
      const { container } = render(<Kpi label="A" value="1" trace={trace} />);
      expect(container.querySelector('[data-slot=kpi-trace]')).toBeNull();
      cleanup();
    }
  });
  it('keeps a NULL as a gap between runs', () => {
    const runs = kpiTraceRuns([1, 2, null, 3, 4]);
    expect(runs.map((r) => r.length)).toEqual([2, 2]);
    expect(runs[1]![0]![0]).toBe(75);
  });
  it('draws a flat history part way up, and the highest value above the lowest', () => {
    expect(kpiTraceRuns([2, 2])[0]!.map(([, y]) => y)).toEqual([50, 50]);
    const [low, high] = kpiTraceRuns([1, 9])[0]!;
    expect(high![1]).toBeLessThan(low![1]);
  });
  it('names what the trace covers only when one is drawn', () => {
    const { container } = render(<Kpi label="A" value="1" trace={[5]} traceLabel="Last 3 weeks" />);
    expect(container.querySelector('[data-slot=kpi]')!.getAttribute('title')).toBeNull();
  });
  it('carries a status tone on the cell', () => {
    const { container } = render(<Kpi label="A" value="1" tone="warn" />);
    expect(container.querySelector('[data-slot=kpi]')!.getAttribute('data-kpi-tone')).toBe('warn');
  });
});
