import { approxDaysText } from '@cs/email';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { formatRemaining } from './format';
import type { CostService } from './types';

/** Low-balance strip above every `/platform/**` page for owners (spec § UI). Warning recipe (D-17: icon, tinted fill, left bar; never solid amber, which is Friday's), in the page flow. */
export function CostWarningStrip({ low }: { low: CostService[] }) {
  if (low.length === 0) return null;
  const one = low[0]!;
  const text =
    low.length === 1
      ? `${one.label} balance low: ${formatRemaining(one)}${one.daysLeft != null ? ` · ${approxDaysText(one.daysLeft)} left` : ''}.`
      : `${low.length} services are low on balance.`;
  return (
    <div role="region" aria-label="Low balance warning" data-tone="warning" className="flex items-start gap-2 rounded-sm bg-warning-surface px-4 py-2.5 text-sm text-ink shadow-[inset_3px_0_0_var(--warning)]">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <p className="min-w-0">
        {text}{' '}
        <Link href="/platform/costs" className="font-semibold underline">
          View costs →
        </Link>
      </p>
    </div>
  );
}
