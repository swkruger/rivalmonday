/** Chart coordinates: marks draw in a 0-100 square that stretches to the plot, so `x` and `y` are percentages. */
export const PLOT = 100;

export interface PlotTick {
  /** 0 = left or top of the plot, 1 = right or bottom. */
  at: number;
  label: string;
}

/**
 * Plot frame shared by the line, rank and bar charts. Marks stretch with the container; axis labels are HTML, so they stay
 * 12 px at every width (a scaled `viewBox` drew them at 7 px on a phone and 30 px full width) and the end labels align to
 * the plot's edges instead of being centred past them. The gutter is as wide as the longest y label.
 */
export function ChartPlot({ label, height, yTicks, xTicks, children }: { label: string; height: number; yTicks: PlotTick[]; xTicks: PlotTick[]; children: React.ReactNode }) {
  const gutter = Math.max(...yTicks.map((t) => t.label.length), 1);
  return (
    <div data-chart-plot className="grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_1.5rem] pt-2 pr-2 text-xs text-chart-axis tabular-nums" style={{ height }}>
      <div aria-hidden className="relative mr-2" style={{ width: `${gutter}ch` }}>
        {yTicks.map((t) => (
          <span key={t.at} data-y-tick className="absolute right-0 -translate-y-1/2 leading-none whitespace-nowrap" style={{ top: `${t.at * PLOT}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="relative min-w-0">
        <svg viewBox={`0 0 ${PLOT} ${PLOT}`} preserveAspectRatio="none" role="img" aria-label={label} className="absolute inset-0 size-full overflow-visible">
          {yTicks.map((t) => (
            <PlotLine key={t.at} x1={0} x2={PLOT} y1={t.at * PLOT} y2={t.at * PLOT} stroke="var(--chart-grid)" strokeWidth={1} />
          ))}
          {children}
        </svg>
      </div>
      <div aria-hidden className="relative col-start-2">
        {xTicks.map((t) => (
          <span
            key={`${t.at}-${t.label}`}
            data-x-tick
            className={`absolute bottom-0 whitespace-nowrap ${t.at <= 0 ? '' : t.at >= 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${t.at * PLOT}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A line whose width stays in screen pixels however far the plot stretches. */
export function PlotLine(props: React.ComponentProps<'line'>) {
  return <line vectorEffect="non-scaling-stroke" {...props} />;
}

/** A round dot in a stretched plot: a nearly zero-length line with round caps stays circular where a `circle` would not. */
export function PlotDot({ x, y, size, color, children, ...rest }: { x: number; y: number; size: number; color: string; children?: React.ReactNode } & Omit<React.ComponentProps<'line'>, 'x' | 'y'>) {
  return (
    <PlotLine x1={x} x2={x + 0.001} y1={y} y2={y} stroke={color} strokeWidth={size} strokeLinecap="round" {...rest}>
      {children}
    </PlotLine>
  );
}
