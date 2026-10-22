import { formatMoney } from '@/lib/format';
import type { CostService } from './types';

/** "$12.34", "7,099 credits ≈ $3.55", "$0.95 used of $5.00", "12.3 CU-hours ≈ $1.23"; "—" when the service has no figure. */
export function formatAmount(s: Pick<CostService, 'unit' | 'kind' | 'amountUsd' | 'units' | 'capUsd' | 'unitRateUsd'>): string {
  const approx = s.amountUsd != null && s.unitRateUsd != null ? ` ≈ ${formatMoney(s.amountUsd, { cents: true })}` : '';
  if (s.unit === 'credits' && s.units != null) return `${Math.round(s.units).toLocaleString('en-US')} credits${approx}`;
  if (s.unit === 'CU-hours' && s.units != null) return `${(Math.round(s.units * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1 })} CU-hours${approx}`;
  if (s.amountUsd == null) return '—';
  if (s.kind === 'usage' && s.capUsd != null) return `${formatMoney(s.amountUsd, { cents: true })} used of ${formatMoney(s.capUsd, { cents: true })}`;
  return formatMoney(s.amountUsd, { cents: true });
}

/** The strip's figure: for capped usage the money still left ("$0.10 left of $5.00 cap"), otherwise the same as the table. */
export function formatRemaining(s: Parameters<typeof formatAmount>[0]): string {
  if (s.kind === 'usage' && s.capUsd != null && s.amountUsd != null) return `${formatMoney(Math.max(0, s.capUsd - s.amountUsd), { cents: true })} left of ${formatMoney(s.capUsd, { cents: true })} cap`;
  return formatAmount(s);
}

export const daysLeftText = (n: number | null): string => (n == null ? '—' : `${Math.round(n)}`);
