import Link from 'next/link';
import { formatAmount } from './format';
import type { CostService } from './types';

/** Low-balance strip above every `/platform/**` page for owners (spec § UI). Same amber as the support banner, but in the page flow. */
export function CostWarningStrip({ low }: { low: CostService[] }) {
  if (low.length === 0) return null;
  const one = low[0]!;
  const text =
    low.length === 1
      ? `${one.label} balance low: ${formatAmount(one)}${one.daysLeft != null ? ` · about ${Math.max(0, Math.round(one.daysLeft))} days left` : ''}.`
      : `${low.length} services are low on balance.`;
  return (
    <div role="region" aria-label="Low balance warning" className="rounded-[14px] bg-amber px-4 py-2.5 text-sm text-amber-text">
      {text}{' '}
      <Link href="/platform/costs" className="font-bold underline">
        View costs →
      </Link>
    </div>
  );
}
