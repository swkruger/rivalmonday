'use client';

/**
 * Where a change's 0-100 score lands: archived below `brief`, weekly brief from `brief` up to `alert`, instant alert from `alert`.
 * The bar is a picture (role="img" with the ranges in words); the legend under it repeats label and range so
 * nothing is colour-only. Segment widths are proportional to how many of the 101 scores each band covers.
 */
export function BandBar({ brief, alert }: { brief: number; alert: number }) {
  const bands = [
    { key: 'archived', label: 'Archived', from: 0, to: brief - 1, swatch: 'bg-muted-surface-2' },
    { key: 'brief', label: 'Weekly brief', from: brief, to: alert - 1, swatch: 'bg-chip-info-bg' },
    { key: 'alert', label: 'Instant alert', from: alert, to: 100, swatch: 'bg-chip-warning-bg' },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Scores 0 to ${brief - 1}: archived. ${brief} to ${alert - 1}: weekly brief. ${alert} to 100: instant alert.`}
        className="flex h-3 w-full gap-0.5"
      >
        {bands.map((b) => (
          <div key={b.key} className={`${b.swatch} rounded-xs`} style={{ flexGrow: b.to - b.from + 1, flexBasis: 0 }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {bands.map((b) => (
          <li key={b.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={`${b.swatch} size-3 rounded-xs`} />
            <span className="font-medium text-ink">{b.label}</span>
            <span className="text-muted-foreground">{`${b.from}–${b.to}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
