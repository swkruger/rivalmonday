import { formatMoney } from '@/lib/format';
import type { CostsData } from './types';

/** Spent this month, projected, and the Low count (amber when above zero). */
export function SummaryCards({ summary }: { summary: CostsData['summary'] }) {
  const cell = (title: string, value: string, warn = false) => (
    <div className="rounded-md border border-line bg-surface p-6">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className={`mt-2 text-[34px] font-extrabold ${warn ? 'text-[#B45309]' : 'text-secondary'}`}>{value}</div>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cell('Spent this month', formatMoney(summary.mtdUsd, { cents: true }))}
      {cell('Projected this month', formatMoney(summary.projectedMonthUsd, { cents: true }))}
      {cell('Warnings', String(summary.lowCount), summary.lowCount > 0)}
    </div>
  );
}
