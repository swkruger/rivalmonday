// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Kpi, KpiStrip } from './kpi-strip';

afterEach(cleanup);

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
