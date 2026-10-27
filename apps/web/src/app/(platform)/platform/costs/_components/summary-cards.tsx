import { StatStrip } from '@/components/stat-strip';
import { formatMoney } from '@/lib/format';
import type { CostsData } from './types';

/** Spent this month, projected, and the Low count (the count says it; no colour-only meaning). */
export function SummaryStrip({ summary }: { summary: CostsData['summary'] }) {
  return (
    <StatStrip
      items={[
        { title: 'Spent this month', value: formatMoney(summary.mtdUsd, { cents: true }) },
        { title: 'Projected this month', value: formatMoney(summary.projectedMonthUsd, { cents: true }) },
        { title: 'Warnings', value: String(summary.lowCount) },
      ]}
    />
  );
}
