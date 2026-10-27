import { approxDaysText } from '@cs/email';
import Link from 'next/link';
import { formatRemaining } from './format';
import type { CostService } from './types';

/** Low-balance strip above every `/platform/**` page for owners (spec § UI). Same amber as the support banner, but in the page flow. */
export function CostWarningStrip({ low }: { low: CostService[] }) {
  if (low.length === 0) return null;
  const one = low[0]!;
  const text =
    low.length === 1
      ? `${one.label} balance low: ${formatRemaining(one)}${one.daysLeft != null ? ` · ${approxDaysText(one.daysLeft)} left` : ''}.`
      : `${low.length} services are low on balance.`;
  return (
    <div role="region" aria-label="Low balance warning" className="rounded-md bg-amber px-4 py-2.5 text-sm text-amber-text">
      {text}{' '}
      <Link href="/platform/costs" className="font-semibold underline">
        View costs →
      </Link>
    </div>
  );
}
