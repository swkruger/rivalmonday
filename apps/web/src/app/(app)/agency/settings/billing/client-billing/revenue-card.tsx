import { formatMoney } from '@/lib/format';

export interface Revenue {
  mrrCents: number;
  payingCount: number;
  paymentNeededCount: number;
  ourCostCents: number;
}

/** Admin-only: what the agency bills versus what Rival Monday costs it. */
export function RevenueCard({ revenue }: { revenue: Revenue }) {
  return (
    <div className="rounded-md bg-muted-surface p-4 text-ink">
      <p className="font-semibold">{`You bill ${formatMoney(revenue.mrrCents, { unit: 'cents' })}/mo · Rival Monday costs you ${formatMoney(revenue.ourCostCents, { unit: 'cents' })}/mo`}</p>
      <p className="mt-1 text-sm">
        {revenue.payingCount} paying · {revenue.paymentNeededCount} payment needed
      </p>
    </div>
  );
}
