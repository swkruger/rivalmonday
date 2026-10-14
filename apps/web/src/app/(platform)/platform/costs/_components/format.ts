import { formatUsd } from '@/server/format';
import type { CostService } from './types';

/** "$12.34", "7,099 credits ≈ $3.55", "$0.95 of $5.00", "12.3 CU-hours ≈ $1.23"; "—" when the service has no figure. */
export function formatAmount(s: Pick<CostService, 'unit' | 'kind' | 'amountUsd' | 'units' | 'capUsd' | 'unitRateUsd'>): string {
  const approx = s.amountUsd != null && s.unitRateUsd != null ? ` ≈ ${formatUsd(s.amountUsd)}` : '';
  if (s.unit === 'credits' && s.units != null) return `${Math.round(s.units).toLocaleString('en-US')} credits${approx}`;
  if (s.unit === 'CU-hours' && s.units != null) return `${(Math.round(s.units * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1 })} CU-hours${approx}`;
  if (s.amountUsd == null) return '—';
  if (s.kind === 'usage' && s.capUsd != null) return `${formatUsd(s.amountUsd)} of ${formatUsd(s.capUsd)}`;
  return formatUsd(s.amountUsd);
}

export const daysLeftText = (n: number | null): string => (n == null ? '—' : `${Math.round(n)}`);
