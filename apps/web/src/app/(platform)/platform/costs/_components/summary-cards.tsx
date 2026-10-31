import { StatStrip } from '@/components/stat-strip';
import { formatMoney } from '@/lib/format';
import type { CostsData } from './types';

/** Spent this month, projected, and the Low count (the count says it; no colour-only meaning). */
export function SummaryStrip({ summary, months }: { summary: CostsData['summary']; months: CostsData['months'] }) {
  return (
    <StatStrip
      items={[
        { title: 'Spent this month', value: formatMoney(summary.mtdUsd, { cents: true }), trace: months.map((m) => m.apiUsd + m.manualUsd), traceLabel: 'Monthly spend, last six months' },
        { title: 'Projected this month', value: formatMoney(summary.projectedMonthUsd, { cents: true }) },
        { title: 'Warnings', value: String(summary.lowCount), tone: summary.lowCount > 0 ? 'warn' : 'brand' },
      ]}
    />
  );
}
