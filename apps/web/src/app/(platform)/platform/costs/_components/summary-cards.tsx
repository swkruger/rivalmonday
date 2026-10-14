import { formatUsd } from '@/server/format';
import type { CostsData } from './types';

/** Spent this month, projected, and the Low count (amber when above zero). */
export function SummaryCards({ summary }: { summary: CostsData['summary'] }) {
  const cell = (title: string, value: string, warn = false) => (
    <div className="rounded-[14px] bg-surface p-6 shadow-card">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className={`mt-2 text-[34px] font-extrabold ${warn ? 'text-[#B45309]' : 'text-secondary'}`}>{value}</div>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cell('Spent this month', formatUsd(summary.mtdUsd))}
      {cell('Projected this month', formatUsd(summary.projectedMonthUsd))}
      {cell('Warnings', String(summary.lowCount), summary.lowCount > 0)}
    </div>
  );
}
